//go:build whatsapp_native

// PicoClaw - Ultra-lightweight personal AI agent
// License: MIT
//
// Copyright (c) 2026 PicoClaw contributors

package whatsapp

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
	_ "modernc.org/sqlite"
	"rsc.io/qr"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/identity"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
	"github.com/sipeed/picoclaw/pkg/utils"
)

const (
	sqliteDriver   = "sqlite"
	whatsappDBName = "store.db"

	reconnectInitial    = 5 * time.Second
	reconnectMax        = 5 * time.Minute
	reconnectMultiplier = 2.0
)

// qrSnapshot captures the latest QR / pairing state for HTTP exposure.
type qrSnapshot struct {
	Status      string // "wait" | "scanned" | "confirmed" | "expired" | "error" | "idle"
	DataURI     string // base64 PNG data URI when Status == "wait"
	PhoneNumber string // populated once paired
	UpdatedAt   time.Time
	ExpiresAt   time.Time
	Error       string
}

// MessageObserver receives inbound and outbound WhatsApp messages so external
// consumers (e.g. the launcher's dashboard inbox) can persist and surface them
// in real time. Implementations must be safe for concurrent use and should not
// block — the channel calls them inline with whatsmeow event handling and the
// outbound Send path.
type MessageObserver interface {
	OnInbound(ctx context.Context, evt InboundObservation)
	OnOutbound(ctx context.Context, evt OutboundObservation)
}

// InboundObservation describes a message received from a contact.
// PausedForAgent reports whether the agent pipeline is being skipped for this
// chat — observers may want to surface this in the UI to make clear that the
// human operator is expected to reply.
type InboundObservation struct {
	ChatJID        string
	SenderJID      string
	PushName       string
	MessageID      string
	Content        string
	Timestamp      time.Time
	PausedForAgent bool
}

// OutboundObservation describes a message the channel just sent. Source is
// either "agent" (driven by the LLM pipeline) or "human" (manual send issued
// by an operator through the dashboard).
type OutboundObservation struct {
	ChatJID   string
	Source    string
	MessageID string
	Content   string
	Timestamp time.Time
	Error     error
	Operator  Operator
}

// Operator carries the identity of the human who triggered a manual send,
// extracted from the trusted-gateway claims at request time.
type Operator struct {
	ID   string
	Name string
}

// PauseChecker is invoked for every inbound message before publishing to the
// bus. Returning true causes the channel to skip the agent pipeline for that
// chat (the observer still gets the message). Returning false (the default)
// keeps the existing behavior.
type PauseChecker func(chatJID string) bool

// WhatsAppNativeChannel implements the WhatsApp channel using whatsmeow (in-process, no external bridge).
type WhatsAppNativeChannel struct {
	*channels.BaseChannel
	config       *config.WhatsAppSettings
	storePath    string
	client       *whatsmeow.Client
	container    *sqlstore.Container
	mu           sync.Mutex
	runCtx       context.Context
	runCancel    context.CancelFunc
	reconnectMu  sync.Mutex
	reconnecting bool
	stopping     atomic.Bool    // set once Stop begins; prevents new wg.Add calls
	wg           sync.WaitGroup // tracks background goroutines (QR handler, reconnect)

	qrMu       sync.RWMutex
	qrSnapshot qrSnapshot

	observerMu sync.RWMutex
	observers  []MessageObserver
	pauseCheck PauseChecker

	inboxHandler *inboxHTTPHandler // optional; nil when persistence is disabled
	avatars      *avatarFetcher    // optional; nil when persistence is disabled

	opMu               sync.Mutex
	lastOperatorByChat map[string]string
}

// AddObserver registers an observer that will receive every inbound and
// outbound message the channel processes. Callers retain ownership of the
// observer; the channel keeps it for the channel's lifetime.
func (c *WhatsAppNativeChannel) AddObserver(o MessageObserver) {
	if o == nil {
		return
	}
	c.observerMu.Lock()
	c.observers = append(c.observers, o)
	c.observerMu.Unlock()
}

// SetPauseChecker installs the callback used to decide whether a given chat
// should bypass the agent pipeline. Passing nil restores the default behavior
// (never paused).
func (c *WhatsAppNativeChannel) SetPauseChecker(fn PauseChecker) {
	c.observerMu.Lock()
	c.pauseCheck = fn
	c.observerMu.Unlock()
}

// snapshotObservers returns the current observer list under a read lock.
func (c *WhatsAppNativeChannel) snapshotObservers() []MessageObserver {
	c.observerMu.RLock()
	out := append([]MessageObserver(nil), c.observers...)
	c.observerMu.RUnlock()
	return out
}

// Client returns the underlying whatsmeow client so observers can query
// profile pictures, contact info, etc. May be nil before pairing.
func (c *WhatsAppNativeChannel) Client() *whatsmeow.Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.client
}

// NewWhatsAppNativeChannel creates a WhatsApp channel that uses whatsmeow for connection.
// storePath is the directory for the SQLite session store (e.g. workspace/whatsapp).
func NewWhatsAppNativeChannel(
	bc *config.Channel,
	name string,
	cfg *config.WhatsAppSettings,
	bus *bus.MessageBus,
	storePath string,
) (channels.Channel, error) {
	groupTrigger := bc.GroupTrigger
	if !groupTrigger.MentionOnly && len(groupTrigger.Prefixes) == 0 {
		groupTrigger.MentionOnly = true
	}
	base := channels.NewBaseChannel(
		name,
		cfg,
		bus,
		bc.AllowFrom,
		channels.WithMaxMessageLength(65536),
		channels.WithGroupTrigger(groupTrigger),
	)
	if storePath == "" {
		storePath = "whatsapp"
	}
	c := &WhatsAppNativeChannel{
		BaseChannel: base,
		config:      cfg,
		storePath:   storePath,
	}

	// Inbox store: SQLite alongside the whatsmeow session store. Failing to
	// open it shouldn't prevent the channel from starting — we just operate
	// without dashboard persistence in that case.
	if err := os.MkdirAll(storePath, 0o700); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to ensure store dir", map[string]any{"path": storePath, "error": err.Error()})
	} else if store, err := inbox.New(storePath); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to open store; dashboard inbox disabled", map[string]any{"error": err.Error()})
	} else {
		pubsub := newInboxPubSub()
		observer := newPersistingObserver(store, pubsub)
		c.observers = append(c.observers, observer)
		c.pauseCheck = func(chatJID string) bool {
			paused, err := store.IsPaused(context.Background(), chatJID)
			if err != nil {
				logger.DebugCF("whatsapp", "inbox: pause lookup failed; defaulting to not paused", map[string]any{"jid": chatJID, "error": err.Error()})
				return false
			}
			return paused
		}
		c.avatars = newAvatarFetcher(c, store, pubsub)
		c.inboxHandler = &inboxHTTPHandler{
			channel: c,
			store:   store,
			pubsub:  pubsub,
			avatars: c.avatars,
		}
	}

	return c, nil
}

func (c *WhatsAppNativeChannel) Start(ctx context.Context) error {
	logger.InfoCF("whatsapp", "Starting WhatsApp native channel (whatsmeow)", map[string]any{"store": c.storePath})

	// Reset lifecycle state from any previous Stop() so a restarted channel
	// behaves correctly.  Use reconnectMu to be consistent with eventHandler
	// and Stop() which coordinate under the same lock.
	c.reconnectMu.Lock()
	c.stopping.Store(false)
	c.reconnecting = false
	c.reconnectMu.Unlock()

	if err := os.MkdirAll(c.storePath, 0o700); err != nil {
		return fmt.Errorf("create session store dir: %w", err)
	}

	dbPath := filepath.Join(c.storePath, whatsappDBName)
	connStr := "file:" + dbPath + "?_foreign_keys=on"

	db, err := sql.Open(sqliteDriver, connStr)
	if err != nil {
		return fmt.Errorf("open whatsapp store: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if _, err = db.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		_ = db.Close()
		return fmt.Errorf("enable foreign keys: %w", err)
	}

	waLogger := waLog.Stdout("WhatsApp", "WARN", true)
	container := sqlstore.NewWithDB(db, sqliteDriver, waLogger)
	if err = container.Upgrade(ctx); err != nil {
		_ = db.Close()
		return fmt.Errorf("open whatsapp store: %w", err)
	}

	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		_ = container.Close()
		return fmt.Errorf("get device store: %w", err)
	}

	client := whatsmeow.NewClient(deviceStore, waLogger)

	// Create runCtx/runCancel BEFORE registering event handler and starting
	// goroutines so that Stop() can cancel them at any time, including during
	// the QR-login flow.
	c.runCtx, c.runCancel = context.WithCancel(ctx)

	client.AddEventHandler(c.eventHandler)

	c.mu.Lock()
	c.container = container
	c.client = client
	c.mu.Unlock()

	// cleanupOnError clears struct references and releases resources when
	// Start() fails after fields are already assigned.  This prevents
	// Stop() from operating on stale references (double-close, disconnect
	// of a partially-initialized client, or stray event handler callbacks).
	startOK := false
	defer func() {
		if startOK {
			return
		}
		c.runCancel()
		client.Disconnect()
		c.mu.Lock()
		c.client = nil
		c.container = nil
		c.mu.Unlock()
		_ = container.Close()
	}()

	if client.Store.ID == nil {
		qrChan, err := client.GetQRChannel(c.runCtx)
		if err != nil {
			return fmt.Errorf("get QR channel: %w", err)
		}
		if err := client.Connect(); err != nil {
			return fmt.Errorf("connect: %w", err)
		}
		// Handle QR events in a background goroutine so Start() returns
		// promptly.  The goroutine is tracked via c.wg and respects
		// c.runCtx for cancellation.
		// Guard wg.Add with reconnectMu + stopping check (same protocol
		// as eventHandler) so a concurrent Stop() cannot enter wg.Wait()
		// while we call wg.Add(1).
		c.reconnectMu.Lock()
		if c.stopping.Load() {
			c.reconnectMu.Unlock()
			return fmt.Errorf("channel stopped during QR setup")
		}
		c.wg.Add(1)
		c.reconnectMu.Unlock()
		go func() {
			defer c.wg.Done()
			for {
				select {
				case <-c.runCtx.Done():
					return
				case evt, ok := <-qrChan:
					if !ok {
						return
					}
					switch evt.Event {
					case "code":
						logger.InfoCF("whatsapp", "Scan this QR code with WhatsApp (Linked Devices):", nil)
						qrterminal.GenerateWithConfig(evt.Code, qrterminal.Config{
							Level:      qrterminal.L,
							Writer:     os.Stdout,
							HalfBlocks: true,
						})
						c.storeQRCode(evt.Code, evt.Timeout)
					case "timeout":
						c.setQRStatus("expired", "")
						logger.InfoCF("whatsapp", "WhatsApp QR code timed out", nil)
					case "success":
						c.setQRConfirmed()
						logger.InfoCF("whatsapp", "WhatsApp pairing confirmed", nil)
					case "error":
						errMsg := "pairing error"
						if evt.Error != nil {
							errMsg = evt.Error.Error()
						}
						c.setQRStatus("error", errMsg)
						logger.WarnCF("whatsapp", "WhatsApp pairing error", map[string]any{"error": errMsg})
					default:
						c.setQRStatus("error", evt.Event)
						logger.InfoCF("whatsapp", "WhatsApp login event", map[string]any{"event": evt.Event})
					}
				}
			}
		}()
	} else {
		c.setQRConfirmed()
		if err := client.Connect(); err != nil {
			return fmt.Errorf("connect: %w", err)
		}
	}

	startOK = true
	c.SetRunning(true)
	logger.InfoC("whatsapp", "WhatsApp native channel connected")
	return nil
}

func (c *WhatsAppNativeChannel) Stop(ctx context.Context) error {
	logger.InfoC("whatsapp", "Stopping WhatsApp native channel")

	// Mark as stopping under reconnectMu so the flag is visible to
	// eventHandler atomically with respect to its wg.Add(1) call.
	// This closes the TOCTOU window where eventHandler could check
	// stopping (false), then Stop sets it true + enters wg.Wait,
	// then eventHandler calls wg.Add(1) — causing a panic.
	c.reconnectMu.Lock()
	c.stopping.Store(true)
	c.reconnectMu.Unlock()

	if c.runCancel != nil {
		c.runCancel()
	}

	// Disconnect the client first so any blocking Connect()/reconnect loops
	// can be interrupted before we wait on the goroutines.
	c.mu.Lock()
	client := c.client
	container := c.container
	c.mu.Unlock()

	if client != nil {
		client.Disconnect()
	}

	// Wait for background goroutines (QR handler, reconnect) to finish in a
	// context-aware way so Stop can be bounded by ctx.
	done := make(chan struct{})
	go func() {
		c.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// All goroutines have finished.
	case <-ctx.Done():
		// Context canceled or timed out; log and proceed with best-effort cleanup.
		logger.WarnC("whatsapp", fmt.Sprintf("Stop context canceled before all goroutines finished: %v", ctx.Err()))
	}

	// Now it is safe to clear and close resources.
	c.mu.Lock()
	c.client = nil
	c.container = nil
	c.mu.Unlock()

	if container != nil {
		_ = container.Close()
	}
	c.qrMu.Lock()
	c.qrSnapshot = qrSnapshot{Status: "idle", UpdatedAt: time.Now()}
	c.qrMu.Unlock()
	c.SetRunning(false)
	return nil
}

func (c *WhatsAppNativeChannel) eventHandler(evt any) {
	switch e := evt.(type) {
	case *events.Message:
		c.handleIncoming(e)
	case *events.Picture:
		// Contact or group photo changed; refresh the cached URL out of band.
		if c.avatars != nil {
			c.avatars.scheduleRefresh(e.JID.String())
		}
	case *events.Disconnected:
		logger.InfoCF("whatsapp", "WhatsApp disconnected, will attempt reconnection", nil)
		c.reconnectMu.Lock()
		if c.reconnecting {
			c.reconnectMu.Unlock()
			return
		}
		// Check stopping while holding the lock so the check and wg.Add
		// are atomic with respect to Stop() setting the flag + calling
		// wg.Wait(). This prevents the TOCTOU race.
		if c.stopping.Load() {
			c.reconnectMu.Unlock()
			return
		}
		c.reconnecting = true
		c.wg.Add(1)
		c.reconnectMu.Unlock()
		go func() {
			defer c.wg.Done()
			c.reconnectWithBackoff()
		}()
	}
}

func (c *WhatsAppNativeChannel) reconnectWithBackoff() {
	defer func() {
		c.reconnectMu.Lock()
		c.reconnecting = false
		c.reconnectMu.Unlock()
	}()

	backoff := reconnectInitial
	for {
		select {
		case <-c.runCtx.Done():
			return
		default:
		}

		c.mu.Lock()
		client := c.client
		c.mu.Unlock()
		if client == nil {
			return
		}

		logger.InfoCF("whatsapp", "WhatsApp reconnecting", map[string]any{"backoff": backoff.String()})
		err := client.Connect()
		if err == nil {
			logger.InfoC("whatsapp", "WhatsApp reconnected")
			return
		}

		logger.WarnCF("whatsapp", "WhatsApp reconnect failed", map[string]any{"error": err.Error()})

		select {
		case <-c.runCtx.Done():
			return
		case <-time.After(backoff):
			if backoff < reconnectMax {
				next := time.Duration(float64(backoff) * reconnectMultiplier)
				if next > reconnectMax {
					next = reconnectMax
				}
				backoff = next
			}
		}
	}
}

func (c *WhatsAppNativeChannel) messageMentionsSelf(msg *waE2E.Message) bool {
	if msg == nil {
		return false
	}
	c.mu.Lock()
	var selfJID string
	var selfUser string
	if c.client != nil && c.client.Store != nil && c.client.Store.ID != nil {
		selfJID = c.client.Store.ID.String()
		selfUser = c.client.Store.ID.User
	}
	c.mu.Unlock()
	if selfJID == "" && selfUser == "" {
		return false
	}
	var mentioned []string
	if ext := msg.GetExtendedTextMessage(); ext != nil && ext.GetContextInfo() != nil {
		mentioned = append(mentioned, ext.GetContextInfo().GetMentionedJID()...)
	}
	for _, jid := range mentioned {
		jid = strings.TrimSpace(jid)
		if jid == "" {
			continue
		}
		if strings.EqualFold(jid, selfJID) || strings.EqualFold(strings.TrimSuffix(jid, "@s.whatsapp.net"), selfUser) {
			return true
		}
	}
	return false
}

func (c *WhatsAppNativeChannel) handleIncoming(evt *events.Message) {
	if evt.Message == nil {
		return
	}
	senderID := evt.Info.Sender.String()
	chatID := evt.Info.Chat.String()
	content := evt.Message.GetConversation()
	if content == "" && evt.Message.ExtendedTextMessage != nil {
		content = evt.Message.ExtendedTextMessage.GetText()
	}
	content = utils.SanitizeMessageContent(content)

	if content == "" {
		return
	}
	peerKind := "direct"
	mentioned := false
	if evt.Info.Chat.Server == types.GroupServer {
		peerKind = "group"
		mentioned = c.messageMentionsSelf(evt.Message)
		allow, stripped := c.ShouldRespondInGroup(mentioned, content)
		if !allow {
			return
		}
		content = stripped
		if strings.TrimSpace(content) == "" {
			return
		}
	}

	var mediaPaths []string

	metadata := make(map[string]string)
	metadata["message_id"] = evt.Info.ID
	if evt.Info.PushName != "" {
		metadata["user_name"] = evt.Info.PushName
	}
	if evt.Info.Chat.Server == types.GroupServer {
		metadata["peer_kind"] = "group"
		metadata["peer_id"] = chatID
	} else {
		metadata["peer_kind"] = "direct"
		metadata["peer_id"] = senderID
	}

	messageID := evt.Info.ID
	sender := bus.SenderInfo{
		Platform:    "whatsapp",
		PlatformID:  senderID,
		CanonicalID: identity.BuildCanonicalID("whatsapp", senderID),
		DisplayName: evt.Info.PushName,
	}

	if !c.IsAllowedSender(sender) {
		return
	}

	logger.DebugCF(
		"whatsapp",
		"WhatsApp message received",
		map[string]any{"sender_id": senderID, "content_preview": utils.Truncate(content, 50)},
	)

	c.observerMu.RLock()
	pauseCheck := c.pauseCheck
	c.observerMu.RUnlock()
	paused := false
	if pauseCheck != nil {
		paused = pauseCheck(chatID)
	}

	for _, obs := range c.snapshotObservers() {
		obs.OnInbound(c.runCtx, InboundObservation{
			ChatJID:        chatID,
			SenderJID:      senderID,
			PushName:       evt.Info.PushName,
			MessageID:      messageID,
			Content:        content,
			Timestamp:      evt.Info.Timestamp,
			PausedForAgent: paused,
		})
	}

	// First-touch avatar resolution: now that the inbox observer created
	// the chat row, kick off a background fetch if the photo isn't cached.
	// No-op when persistence is disabled or the chat already has a URL.
	if c.avatars != nil {
		c.avatars.ensure(c.runCtx, chatID)
	}

	if paused {
		logger.DebugCF(
			"whatsapp",
			"WhatsApp agent paused for chat; not forwarding to agent",
			map[string]any{"chat_id": chatID, "message_id": messageID},
		)
		return
	}

	inboundCtx := bus.InboundContext{
		Channel:   "whatsapp",
		ChatID:    chatID,
		SenderID:  senderID,
		MessageID: messageID,
		ChatType:  peerKind,
		Mentioned: mentioned,
		Raw:       metadata,
	}

	c.HandleInboundContext(c.runCtx, chatID, content, mediaPaths, inboundCtx, sender)
}

func (c *WhatsAppNativeChannel) Send(ctx context.Context, msg bus.OutboundMessage) ([]string, error) {
	return c.sendWithSource(ctx, msg, "agent", Operator{})
}

// SendMedia sends media attachments as native WhatsApp messages.
func (c *WhatsAppNativeChannel) SendMedia(ctx context.Context, msg bus.OutboundMediaMessage) ([]string, error) {
	return c.sendMediaWithSource(ctx, msg, "agent")
}

// SendManual sends a message tagged as authored by a human operator. Observers
// are notified with Source = "human" so the dashboard can render the bubble
// with the right styling and skip the agent attribution. The op identifies
// who sent the message (used for audit and to surface the operator's name).
func (c *WhatsAppNativeChannel) SendManual(ctx context.Context, chatID, content string, op Operator) error {
	mode, displayName := c.resolveOperatorIdentification(chatID, op)
	if (mode == "transition" || mode == "transition+prefix") && c.operatorChangedFor(chatID, op.ID) {
		intro := fmt.Sprintf("✋ %s assumiu o atendimento e vai te ajudar daqui em diante.", displayName)
		if _, err := c.sendWithSource(ctx, bus.OutboundMessage{ChatID: chatID, Content: intro}, "human", op); err == nil {
			c.recordOperatorForChat(chatID, op.ID)
		}
	}
	final := content
	if mode == "prefix" || mode == "transition+prefix" {
		final = "*" + displayName + ":* " + content
	}
	_, err := c.sendWithSource(ctx, bus.OutboundMessage{ChatID: chatID, Content: final}, "human", op)
	return err
}

func (c *WhatsAppNativeChannel) resolveOperatorIdentification(chatID string, op Operator) (mode, displayName string) {
	mode = "transition"
	if provider := c.BehaviorProvider(); provider != nil {
		if bh := provider.ChannelBehavior(c.Name(), chatID); bh != nil {
			if m := strings.TrimSpace(bh.OperatorIdentificationMode); m != "" {
				mode = m
			}
		}
	}
	displayName = strings.TrimSpace(op.Name)
	if displayName == "" {
		displayName = strings.TrimSpace(op.ID)
	}
	if displayName == "" {
		return "none", ""
	}
	if at := strings.IndexByte(displayName, '@'); at > 0 {
		displayName = displayName[:at]
	}
	return mode, displayName
}

func (c *WhatsAppNativeChannel) operatorChangedFor(chatID, opID string) bool {
	if opID == "" {
		return false
	}
	c.opMu.Lock()
	defer c.opMu.Unlock()
	if c.lastOperatorByChat == nil {
		c.lastOperatorByChat = map[string]string{}
	}
	return c.lastOperatorByChat[chatID] != opID
}

func (c *WhatsAppNativeChannel) recordOperatorForChat(chatID, opID string) {
	c.opMu.Lock()
	defer c.opMu.Unlock()
	if c.lastOperatorByChat == nil {
		c.lastOperatorByChat = map[string]string{}
	}
	c.lastOperatorByChat[chatID] = opID
}

func (c *WhatsAppNativeChannel) sendWithSource(ctx context.Context, msg bus.OutboundMessage, source string, op Operator) ([]string, error) {
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	c.mu.Lock()
	client := c.client
	c.mu.Unlock()

	if client == nil || !client.IsConnected() {
		return nil, fmt.Errorf("whatsapp connection not established: %w", channels.ErrTemporary)
	}

	// Detect unpaired state: the client is connected (to WhatsApp servers)
	// but has not completed QR-login yet, so sending would fail.
	if client.Store.ID == nil {
		return nil, fmt.Errorf("whatsapp not yet paired (QR login pending): %w", channels.ErrTemporary)
	}

	to, err := parseJID(msg.ChatID)
	if err != nil {
		return nil, fmt.Errorf("invalid chat id %q: %w", msg.ChatID, err)
	}
	to, err = resolveSendDestination(ctx, client, to)
	if err != nil {
		return nil, err
	}
	if isPairedWhatsAppUser(client, to) {
		return nil, fmt.Errorf("recipient matches the paired WhatsApp account; use a different recipient: %w", channels.ErrSendFailed)
	}

	messageID := client.GenerateMessageID()
	waMsg := &waE2E.Message{
		Conversation: proto.String(msg.Content),
	}

	resp, sendErr := client.SendMessage(ctx, to, waMsg, whatsmeow.SendRequestExtra{ID: messageID})
	if sendErr != nil {
		for _, obs := range c.snapshotObservers() {
			obs.OnOutbound(ctx, OutboundObservation{
				ChatJID:   msg.ChatID,
				Source:    source,
				MessageID: messageID,
				Content:   msg.Content,
				Timestamp: time.Now(),
				Error:     sendErr,
				Operator:  op,
			})
		}
		return nil, fmt.Errorf("whatsapp send: %w", channels.ErrTemporary)
	}

	for _, obs := range c.snapshotObservers() {
		obs.OnOutbound(ctx, OutboundObservation{
			ChatJID:   msg.ChatID,
			Source:    source,
			MessageID: messageID,
			Content:   msg.Content,
			Timestamp: time.Now(),
			Operator:  op,
		})
	}
	if resp.ID != "" {
		messageID = string(resp.ID)
	}
	return []string{messageID}, nil
}

func (c *WhatsAppNativeChannel) sendMediaWithSource(ctx context.Context, msg bus.OutboundMediaMessage, source string) ([]string, error) {
	if !c.IsRunning() {
		return nil, channels.ErrNotRunning
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	c.mu.Lock()
	client := c.client
	c.mu.Unlock()

	if client == nil || !client.IsConnected() {
		return nil, fmt.Errorf("whatsapp connection not established: %w", channels.ErrTemporary)
	}
	if client.Store.ID == nil {
		return nil, fmt.Errorf("whatsapp not yet paired (QR login pending): %w", channels.ErrTemporary)
	}

	to, err := parseJID(msg.ChatID)
	if err != nil {
		return nil, fmt.Errorf("invalid chat id %q: %w", msg.ChatID, err)
	}
	to, err = resolveSendDestination(ctx, client, to)
	if err != nil {
		return nil, err
	}
	if isPairedWhatsAppUser(client, to) {
		return nil, fmt.Errorf("recipient matches the paired WhatsApp account; use a different recipient: %w", channels.ErrSendFailed)
	}

	store := c.GetMediaStore()
	if store == nil {
		return nil, fmt.Errorf("no media store available: %w", channels.ErrSendFailed)
	}

	messageIDs := make([]string, 0, len(msg.Parts))
	for _, part := range msg.Parts {
		localPath, meta, err := store.ResolveWithMeta(part.Ref)
		if err != nil {
			logger.ErrorCF("whatsapp", "Failed to resolve media ref", map[string]any{
				"ref":   part.Ref,
				"error": err.Error(),
			})
			continue
		}

		data, err := os.ReadFile(localPath)
		if err != nil {
			logger.ErrorCF("whatsapp", "Failed to read media file", map[string]any{
				"path":  localPath,
				"error": err.Error(),
			})
			continue
		}
		if len(data) == 0 {
			logger.ErrorCF("whatsapp", "Skipping empty media file", map[string]any{"path": localPath})
			continue
		}

		filename := whatsappMediaFilename(part, meta, localPath)
		contentType := whatsappMediaContentType(part, meta, localPath, data)
		mediaType := whatsappMediaType(part, contentType)
		observerContent := whatsappMediaObserverContent(part, filename, mediaType)
		messageID := client.GenerateMessageID()

		uploadResp, err := client.Upload(ctx, data, mediaType)
		if err != nil {
			for _, obs := range c.snapshotObservers() {
				obs.OnOutbound(ctx, OutboundObservation{
					ChatJID:   msg.ChatID,
					Source:    source,
					MessageID: messageID,
					Content:   observerContent,
					Timestamp: time.Now(),
					Error:     err,
				})
			}
			return nil, fmt.Errorf("whatsapp upload media: %w", channels.ErrTemporary)
		}

		waMsg := buildWhatsAppMediaMessage(part, filename, contentType, mediaType, uploadResp)
		_, sendErr := client.SendMessage(ctx, to, waMsg, whatsmeow.SendRequestExtra{ID: messageID})
		if sendErr != nil {
			for _, obs := range c.snapshotObservers() {
				obs.OnOutbound(ctx, OutboundObservation{
					ChatJID:   msg.ChatID,
					Source:    source,
					MessageID: messageID,
					Content:   observerContent,
					Timestamp: time.Now(),
					Error:     sendErr,
				})
			}
			return nil, fmt.Errorf("whatsapp send media: %w", channels.ErrTemporary)
		}

		for _, obs := range c.snapshotObservers() {
			obs.OnOutbound(ctx, OutboundObservation{
				ChatJID:   msg.ChatID,
				Source:    source,
				MessageID: messageID,
				Content:   observerContent,
				Timestamp: time.Now(),
			})
		}
		messageIDs = append(messageIDs, messageID)
	}

	if len(messageIDs) == 0 {
		return nil, fmt.Errorf("no deliverable media parts: %w", channels.ErrSendFailed)
	}
	return messageIDs, nil
}

func whatsappMediaFilename(part bus.MediaPart, meta media.MediaMeta, localPath string) string {
	filename := strings.TrimSpace(part.Filename)
	if filename == "" {
		filename = strings.TrimSpace(meta.Filename)
	}
	if filename == "" {
		filename = filepath.Base(localPath)
	}
	if filename == "." || filename == string(filepath.Separator) {
		return "attachment"
	}
	return filename
}

func whatsappMediaContentType(part bus.MediaPart, meta media.MediaMeta, localPath string, data []byte) string {
	contentType := strings.TrimSpace(part.ContentType)
	if contentType == "" {
		contentType = strings.TrimSpace(meta.ContentType)
	}
	if contentType == "" {
		contentType = strings.TrimSpace(mime.TypeByExtension(filepath.Ext(localPath)))
	}
	if contentType == "" && len(data) > 0 {
		contentType = http.DetectContentType(data)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return contentType
}

func whatsappMediaType(part bus.MediaPart, contentType string) whatsmeow.MediaType {
	switch strings.ToLower(strings.TrimSpace(part.Type)) {
	case "image":
		return whatsmeow.MediaImage
	case "audio":
		return whatsmeow.MediaAudio
	case "video":
		return whatsmeow.MediaVideo
	case "file", "document":
		return whatsmeow.MediaDocument
	}

	switch {
	case strings.HasPrefix(contentType, "image/"):
		return whatsmeow.MediaImage
	case strings.HasPrefix(contentType, "audio/"):
		return whatsmeow.MediaAudio
	case strings.HasPrefix(contentType, "video/"):
		return whatsmeow.MediaVideo
	default:
		return whatsmeow.MediaDocument
	}
}

func buildWhatsAppMediaMessage(
	part bus.MediaPart,
	filename string,
	contentType string,
	mediaType whatsmeow.MediaType,
	resp whatsmeow.UploadResponse,
) *waE2E.Message {
	caption := strings.TrimSpace(part.Caption)
	switch mediaType {
	case whatsmeow.MediaImage:
		image := &waE2E.ImageMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			Mimetype:      proto.String(contentType),
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
		}
		if caption != "" {
			image.Caption = proto.String(caption)
		}
		return &waE2E.Message{ImageMessage: image}
	case whatsmeow.MediaVideo:
		video := &waE2E.VideoMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			Mimetype:      proto.String(contentType),
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
		}
		if caption != "" {
			video.Caption = proto.String(caption)
		}
		return &waE2E.Message{VideoMessage: video}
	case whatsmeow.MediaAudio:
		return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			Mimetype:      proto.String(contentType),
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
		}}
	default:
		doc := &waE2E.DocumentMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			Mimetype:      proto.String(contentType),
			Title:         proto.String(filename),
			FileName:      proto.String(filename),
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
		}
		if caption != "" {
			doc.Caption = proto.String(caption)
		}
		return &waE2E.Message{DocumentMessage: doc}
	}
}

func whatsappMediaObserverContent(part bus.MediaPart, filename string, mediaType whatsmeow.MediaType) string {
	if caption := strings.TrimSpace(part.Caption); caption != "" {
		return caption
	}
	switch mediaType {
	case whatsmeow.MediaImage:
		return "[image] " + filename
	case whatsmeow.MediaAudio:
		return "[audio] " + filename
	case whatsmeow.MediaVideo:
		return "[video] " + filename
	default:
		return "[file] " + filename
	}
}

// storeQRCode encodes the raw QR string as a PNG data URI and updates the snapshot.
func (c *WhatsAppNativeChannel) storeQRCode(code string, timeout time.Duration) {
	dataURI := encodeQRDataURI(code)
	now := time.Now()
	expires := now.Add(timeout)
	if timeout <= 0 {
		expires = now.Add(60 * time.Second)
	}
	c.qrMu.Lock()
	c.qrSnapshot = qrSnapshot{
		Status:    "wait",
		DataURI:   dataURI,
		UpdatedAt: now,
		ExpiresAt: expires,
	}
	c.qrMu.Unlock()
}

func (c *WhatsAppNativeChannel) setQRStatus(status, errMsg string) {
	c.qrMu.Lock()
	c.qrSnapshot.Status = status
	c.qrSnapshot.Error = errMsg
	c.qrSnapshot.UpdatedAt = time.Now()
	if status != "wait" {
		c.qrSnapshot.DataURI = ""
	}
	c.qrMu.Unlock()
}

func (c *WhatsAppNativeChannel) setQRConfirmed() {
	phone := ""
	c.mu.Lock()
	if c.client != nil && c.client.Store != nil && c.client.Store.ID != nil {
		phone = c.client.Store.ID.User
	}
	c.mu.Unlock()
	c.qrMu.Lock()
	c.qrSnapshot = qrSnapshot{
		Status:      "confirmed",
		PhoneNumber: phone,
		UpdatedAt:   time.Now(),
	}
	c.qrMu.Unlock()
}

func encodeQRDataURI(content string) string {
	code, err := qr.Encode(content, qr.L)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(code.PNG())
}

// HealthPath implements channels.HealthChecker. We register a *prefix* so the
// channel can expose both the pairing QR endpoint and the inbox sub-router on
// the same shared HTTP server without needing a new manager-level extension.
// HealthHandler dispatches internally based on the trailing path component.
func (c *WhatsAppNativeChannel) HealthPath() string {
	return "/whatsapp_native/"
}

// HealthHandler dispatches `/whatsapp_native/{sub}` requests to the right
// internal handler. `qr` returns the pairing state; `inbox/...` is forwarded
// to the inbox HTTP handler when the inbox store is available.
//
//	GET  /whatsapp_native/qr                          → pairing/QR JSON
//	POST /whatsapp_native/disconnect                  → logout and clear session
//	GET  /whatsapp_native/inbox/chats                 → list chats
//	GET  /whatsapp_native/inbox/chats/{jid}           → chat detail
//	GET  /whatsapp_native/inbox/chats/{jid}/messages  → messages
//	POST /whatsapp_native/inbox/chats/{jid}/pause     → toggle agent pause
//	POST /whatsapp_native/inbox/chats/{jid}/send      → send manual reply
//	POST /whatsapp_native/inbox/chats/{jid}/read      → reset unread
//	GET  /whatsapp_native/inbox/chats/{jid}/avatar    → fetch/cache avatar (cache-first)
//	POST /whatsapp_native/inbox/chats/{jid}/avatar    → force-refresh avatar
//	GET  /whatsapp_native/inbox/events                → SSE stream
func (c *WhatsAppNativeChannel) HealthHandler(w http.ResponseWriter, r *http.Request) {
	sub := strings.TrimPrefix(r.URL.Path, "/whatsapp_native/")
	switch {
	case sub == "qr":
		c.serveQR(w, r)
	case sub == "disconnect":
		c.serveDisconnect(w, r)
	case strings.HasPrefix(sub, "inbox"):
		if c.inboxHandler == nil {
			http.Error(w, `{"error":"inbox not available"}`, http.StatusServiceUnavailable)
			return
		}
		c.inboxHandler.ServeHTTP(w, r)
	default:
		http.NotFound(w, r)
	}
}

// serveQR returns the current pairing / QR state as JSON.
func (c *WhatsAppNativeChannel) serveQR(w http.ResponseWriter, r *http.Request) {
	c.qrMu.RLock()
	snap := c.qrSnapshot
	c.qrMu.RUnlock()

	if snap.Status == "wait" && !snap.ExpiresAt.IsZero() && time.Now().After(snap.ExpiresAt) {
		c.setQRStatus("expired", "")
		c.qrMu.RLock()
		snap = c.qrSnapshot
		c.qrMu.RUnlock()
	}

	if snap.Status == "" {
		snap.Status = "idle"
	}

	type response struct {
		Status      string `json:"status"`
		QRDataURI   string `json:"qr_data_uri,omitempty"`
		PhoneNumber string `json:"phone_number,omitempty"`
		Error       string `json:"error,omitempty"`
		UpdatedAt   int64  `json:"updated_at,omitempty"`
		ExpiresAt   int64  `json:"expires_at,omitempty"`
	}

	resp := response{
		Status:      snap.Status,
		QRDataURI:   snap.DataURI,
		PhoneNumber: snap.PhoneNumber,
		Error:       snap.Error,
	}
	if !snap.UpdatedAt.IsZero() {
		resp.UpdatedAt = snap.UpdatedAt.Unix()
	}
	if !snap.ExpiresAt.IsZero() {
		resp.ExpiresAt = snap.ExpiresAt.Unix()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}

// serveDisconnect logs out the current WhatsApp session, clearing the device
// store so the next Start() presents a fresh QR code for re-pairing.
func (c *WhatsAppNativeChannel) serveDisconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "method not allowed"})
		return
	}

	c.mu.Lock()
	client := c.client
	c.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	if client == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not connected"})
		return
	}

	if err := client.Logout(r.Context()); err != nil {
		logger.WarnCF("whatsapp", "logout failed", map[string]any{"error": err.Error()})
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	logger.InfoC("whatsapp", "WhatsApp session logged out via dashboard")
	c.qrMu.Lock()
	c.qrSnapshot = qrSnapshot{Status: "idle", UpdatedAt: time.Now()}
	c.qrMu.Unlock()

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// parseJID converts a chat ID (phone number or JID string) to types.JID.
func parseJID(s string) (types.JID, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return types.JID{}, fmt.Errorf("empty chat id")
	}
	if strings.Contains(s, "@") {
		return types.ParseJID(s)
	}
	return types.NewJID(s, types.DefaultUserServer), nil
}

func resolveSendDestination(ctx context.Context, client *whatsmeow.Client, to types.JID) (types.JID, error) {
	if to.Server != types.DefaultUserServer || client == nil || client.Store == nil || client.Store.LIDs == nil || client.Store.GetLID().IsEmpty() {
		return to, nil
	}
	if lid, err := client.Store.LIDs.GetLIDForPN(ctx, to); err != nil {
		return to, fmt.Errorf("failed to resolve WhatsApp LID for %s: %v: %w", to, err, channels.ErrTemporary)
	} else if !lid.IsEmpty() {
		return lid, nil
	}

	info, err := client.GetUserInfo(ctx, []types.JID{to})
	if err != nil {
		return to, fmt.Errorf("failed to fetch WhatsApp user info for %s: %v: %w", to, err, channels.ErrTemporary)
	}
	if lid := info[to].LID; !lid.IsEmpty() {
		return lid, nil
	}
	return to, nil
}

func isPairedWhatsAppUser(client *whatsmeow.Client, to types.JID) bool {
	if client == nil || client.Store == nil {
		return false
	}
	if client.Store.ID != nil && to.Server == types.DefaultUserServer && sameWhatsAppPhoneUser(client.Store.ID.User, to.User) {
		return true
	}
	ownLID := client.Store.GetLID()
	return !ownLID.IsEmpty() && to.Server == types.HiddenUserServer && ownLID.ToNonAD() == to.ToNonAD()
}

func sameWhatsAppPhoneUser(a, b string) bool {
	a = phoneDigits(a)
	b = phoneDigits(b)
	if a == "" || b == "" {
		return false
	}
	if a == b {
		return true
	}
	return sameBrazilianNinthDigitVariant(a, b)
}

func phoneDigits(s string) string {
	var out strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			out.WriteRune(r)
		}
	}
	return out.String()
}

func sameBrazilianNinthDigitVariant(a, b string) bool {
	if !strings.HasPrefix(a, "55") || !strings.HasPrefix(b, "55") {
		return false
	}
	if len(a) > len(b) {
		a, b = b, a
	}
	if len(b) != len(a)+1 || len(a) < 12 {
		return false
	}
	if a[:4] != b[:4] {
		return false
	}
	return b[4] == '9' && a[4:] == b[5:]
}
