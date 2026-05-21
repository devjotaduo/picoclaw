package publicweb

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
)

// ChannelName is the canonical registered name for this channel.
const ChannelName = "public-web"

// streamBufferSize is the capacity of each per-session outbound channel.
// Sized to accommodate short bursts (intro message + first agent reply +
// follow-ups) without blocking Send. The HTTP SSE layer drains it
// continuously, so a small buffer is fine.
const streamBufferSize = 16

// ErrNoStream is returned by Send when no SSE subscriber is currently
// attached to the target session. The Phase 5 HTTP layer treats this as
// "visitor disconnected; drop the message" — not a fatal error.
var ErrNoStream = errors.New("publicweb: no active stream for session")

// Channel is the public-web channel implementation.
//
// It is unusual among channels in that it owns no upstream connection of
// its own; the launcher's HTTP layer (Phase 5) drives inbound by calling
// AcceptInbound and consumes outbound by reading from the channels
// returned by SubscribeStream.
//
// Channel implements channels.WebhookHandler (see http.go): when the
// channel is enabled, the manager's shared HTTP server auto-registers it
// under /api/public/chat. The launcher reverse-proxies anonymous traffic
// from the same path to the gateway port — no direct exposure of the
// gateway listener is required.
type Channel struct {
	*channels.BaseChannel

	settings *Settings

	mu       sync.RWMutex
	sessions map[string]time.Time
	streams  map[string]chan bus.OutboundMessage
}

// NewChannel constructs a public-web Channel.
//
// The allowList is hard-coded to {"*"} so BaseChannel's "SECURITY: allows
// EVERYONE" startup warning is suppressed — public chat is anonymous by
// design. The settings argument may be nil, in which case defaultSettings()
// is used.
func NewChannel(messageBus *bus.MessageBus, settings *Settings) *Channel {
	if settings == nil {
		settings = defaultSettings()
	}

	base := channels.NewBaseChannel(ChannelName, settings, messageBus, []string{"*"})

	ch := &Channel{
		BaseChannel: base,
		settings:    settings,
		sessions:    make(map[string]time.Time),
		streams:     make(map[string]chan bus.OutboundMessage),
	}
	base.SetOwner(ch)
	return ch
}

// ----- Channel interface -----

// Start marks the channel running. The public-web channel owns no upstream
// connection of its own (the HTTP layer is the connection), so there is no
// goroutine or socket to spin up here.
func (c *Channel) Start(ctx context.Context) error {
	c.SetRunning(true)
	return nil
}

// Stop marks the channel not-running and tears down per-session state. All
// subscribed SSE streams are closed so their consumer goroutines exit
// cleanly.
func (c *Channel) Stop(ctx context.Context) error {
	c.SetRunning(false)

	c.mu.Lock()
	defer c.mu.Unlock()
	for sid, ch := range c.streams {
		close(ch)
		delete(c.streams, sid)
	}
	for sid := range c.sessions {
		delete(c.sessions, sid)
	}
	return nil
}

// Send delivers an outbound message to the SSE stream of the target
// session. The session id is carried in OutboundMessage.ChatID (set by
// AcceptInbound on the corresponding inbound message). Returns the
// generated message id wrapped in a single-element slice, or ErrNoStream
// if no subscriber is currently attached.
func (c *Channel) Send(ctx context.Context, msg bus.OutboundMessage) ([]string, error) {
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}

	sessionID := msg.ChatID
	if sessionID == "" {
		// Some senders may use Context.ChatID instead of the top-level
		// field; fall back to it so we are tolerant of either.
		sessionID = msg.Context.ChatID
	}
	if sessionID == "" {
		return nil, fmt.Errorf("publicweb: outbound message missing chat_id: %w", channels.ErrSendFailed)
	}

	c.mu.RLock()
	stream, ok := c.streams[sessionID]
	c.mu.RUnlock()
	if !ok {
		return nil, ErrNoStream
	}

	messageID, err := newMessageID()
	if err != nil {
		return nil, err
	}

	select {
	case stream <- msg:
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
		// Stream consumer is slow / stuck. Surface as a temporary error so
		// the caller can decide whether to retry. We do NOT drop the
		// channel here — a temporarily wedged consumer should not destroy
		// the session.
		return nil, channels.ErrTemporary
	}

	return []string{messageID}, nil
}

// IsAllowed always returns true. Public chat is anonymous and the channel
// is meant to be open by design; the allowlist concept does not apply.
// Abuse mitigation is the responsibility of the Phase 5 HTTP layer
// (rate-limit per IP, optional captcha).
func (c *Channel) IsAllowed(senderID string) bool { return true }

// IsAllowedSender mirrors IsAllowed for structured sender info.
func (c *Channel) IsAllowedSender(sender bus.SenderInfo) bool { return true }

// ----- Public helpers used by the Phase 5 HTTP layer -----

// CanonicalSenderID returns the deterministic, opaque sender identifier for
// a given (sessionID, ip) pair: "public-web:" + first 8 bytes of
// sha256(sessionID + "|" + ip) encoded as hex (16 hex chars).
//
// The hash makes the cookie un-recoverable from the identity, so the
// agent memory layer never stores the raw session token. The identity is
// stable for the lifetime of the visitor's session and IP — if the IP
// changes (e.g. the visitor switches Wi-Fi networks) the identity will
// change. This is an acceptable v1 limitation; documented in the package
// comment.
func (c *Channel) CanonicalSenderID(sessionID, ip string) string {
	sum := sha256.Sum256([]byte(sessionID + "|" + ip))
	return ChannelName + ":" + hex.EncodeToString(sum[:8])
}

// AcceptInbound is called by the Phase 5 HTTP handler when a visitor
// posts a new message. It builds an InboundMessage with both the
// canonical sender id (cookie-safe) and the session id as the platform-id
// (so Send can route the reply back), then publishes it to the bus.
func (c *Channel) AcceptInbound(ctx context.Context, sessionID, ip, text string) error {
	if !c.IsRunning() {
		return channels.ErrNotRunning
	}
	if sessionID == "" {
		return fmt.Errorf("publicweb: AcceptInbound: empty session_id: %w", channels.ErrSendFailed)
	}

	canonical := c.CanonicalSenderID(sessionID, ip)
	sender := bus.SenderInfo{
		Platform:    ChannelName,
		PlatformID:  sessionID,
		CanonicalID: canonical,
	}

	inboundCtx := bus.InboundContext{
		Channel:  ChannelName,
		ChatID:   sessionID,
		ChatType: "direct",
		SenderID: canonical,
	}

	c.touchSession(sessionID)

	// Use BaseChannel's pipeline so that any future behavior providers,
	// media stores, and placeholder recorders see public-web messages
	// like every other channel. The deliveryChatID is the session id;
	// content is the visitor's text; no media in v1.
	c.HandleMessageWithContext(ctx, sessionID, text, nil, inboundCtx, sender)
	return nil
}

// SubscribeStream creates (or replaces) the per-session outbound channel
// that the SSE HTTP handler will read from. Replacing an existing stream
// closes the previous one — there is at most one SSE consumer per
// session.
func (c *Channel) SubscribeStream(sessionID string) <-chan bus.OutboundMessage {
	stream := make(chan bus.OutboundMessage, streamBufferSize)

	c.mu.Lock()
	defer c.mu.Unlock()
	if existing, ok := c.streams[sessionID]; ok {
		close(existing)
	}
	c.streams[sessionID] = stream
	c.sessions[sessionID] = time.Now()
	return stream
}

// UnsubscribeStream tears down the SSE stream for a session. Safe to call
// multiple times — calling it when no stream exists is a no-op.
func (c *Channel) UnsubscribeStream(sessionID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if stream, ok := c.streams[sessionID]; ok {
		close(stream)
		delete(c.streams, sessionID)
	}
}

// touchSession updates the last-seen timestamp for a session. The Phase 5
// HTTP layer (or a future janitor goroutine) is responsible for evicting
// idle sessions based on Settings.SessionTTLSeconds.
func (c *Channel) touchSession(sessionID string) {
	c.mu.Lock()
	c.sessions[sessionID] = time.Now()
	c.mu.Unlock()
}

// newMessageID returns a random 16-hex-char id used to satisfy the
// Channel.Send return contract. crypto/rand is used so concurrent Sends
// from many sessions cannot collide.
func newMessageID() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("publicweb: generate message id: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}
