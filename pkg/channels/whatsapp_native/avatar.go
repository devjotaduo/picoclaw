//go:build whatsapp_native

package whatsapp

import (
	"context"
	"errors"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"

	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// avatarFetcher resolves WhatsApp profile pictures (contacts and groups) and
// caches the resulting CDN URL + picture id in the inbox store. It runs the
// network call off the hot path (whatsmeow event handler / HTTP request) so
// the inbox UI feels instant even when the dashboard sees a chat for the
// first time.
//
// Three sources currently drive an avatar refresh:
//   - Incoming message for a chat with no cached avatar (lazy first-fetch).
//   - whatsmeow *events.Picture (someone changed the photo).
//   - Dashboard POST .../avatar (manual force-refresh).
type avatarFetcher struct {
	channel *WhatsAppNativeChannel
	store   *inbox.Store
	pubsub  *inboxPubSub

	// inFlight dedupes concurrent fetches for the same JID. A goroutine
	// stores struct{}{} on entry and deletes on exit.
	inFlight sync.Map // map[string]struct{}

	// lastAttempt throttles repeated calls (cache hit or miss) for the same
	// JID so a flapping picture event or a dashboard hammering refresh
	// doesn't hit whatsmeow at unbounded rate.
	mu          sync.Mutex
	lastAttempt map[string]time.Time
	minInterval time.Duration
	fetchTimeout time.Duration
}

func newAvatarFetcher(channel *WhatsAppNativeChannel, store *inbox.Store, pubsub *inboxPubSub) *avatarFetcher {
	return &avatarFetcher{
		channel:      channel,
		store:        store,
		pubsub:       pubsub,
		lastAttempt:  make(map[string]time.Time),
		minInterval:  90 * time.Second,
		fetchTimeout: 15 * time.Second,
	}
}

// ensure triggers an asynchronous fetch only when the chat has no cached
// avatar. Safe to call from any hot path — it never blocks the caller.
func (a *avatarFetcher) ensure(ctx context.Context, jid string) {
	if a == nil || jid == "" {
		return
	}
	chat, err := a.store.GetChat(ctx, jid)
	if err != nil || chat == nil {
		// Chat row not (yet) present — skip silently; this is best-effort.
		return
	}
	if chat.AvatarURL != "" {
		return
	}
	a.fireAndForget(jid, false)
}

// scheduleRefresh forces a re-fetch (used when whatsmeow tells us the picture
// changed, or when the dashboard calls POST .../avatar).
func (a *avatarFetcher) scheduleRefresh(jid string) {
	if a == nil || jid == "" {
		return
	}
	a.fireAndForget(jid, true)
}

func (a *avatarFetcher) fireAndForget(jid string, force bool) {
	if !a.allowAttempt(jid, force) {
		return
	}
	if _, loaded := a.inFlight.LoadOrStore(jid, struct{}{}); loaded {
		return
	}
	go func() {
		defer a.inFlight.Delete(jid)
		ctx, cancel := context.WithTimeout(context.Background(), a.fetchTimeout)
		defer cancel()
		if _, err := a.Refresh(ctx, jid, force); err != nil {
			logger.DebugCF("whatsapp", "avatar: background fetch failed", map[string]any{
				"jid":   jid,
				"error": err.Error(),
			})
		}
	}()
}

// Refresh synchronously fetches the avatar from whatsmeow and updates the
// store. Callers should generally prefer ensure / scheduleRefresh; this is
// exposed for the HTTP handler which may want to surface the result inline
// for the dashboard.
//
// Returned chat may be nil when the store hasn't recorded the JID yet (we
// still try to fetch and persist on the next call). The bool return is true
// when an actual remote call ran (vs. a cache hit / throttle skip).
func (a *avatarFetcher) Refresh(ctx context.Context, jid string, force bool) (*inbox.Chat, error) {
	if a == nil || jid == "" {
		return nil, errors.New("avatar: empty jid")
	}

	if !force {
		// Cache-first when the caller doesn't insist on a remote round-trip.
		if chat, err := a.store.GetChat(ctx, jid); err == nil && chat != nil && chat.AvatarURL != "" {
			return chat, nil
		}
	}

	client := a.channel.Client()
	if client == nil {
		return nil, errors.New("whatsapp client not ready")
	}

	parsedJID, err := types.ParseJID(jid)
	if err != nil {
		return nil, err
	}

	pic, err := client.GetProfilePictureInfo(ctx, parsedJID, &whatsmeow.GetProfilePictureParams{Preview: false})
	if err != nil {
		// "Not set" / "unauthorized" are normal outcomes — record that we
		// looked so we don't keep hammering whatsmeow for the same JID.
		if errors.Is(err, whatsmeow.ErrProfilePictureNotSet) ||
			errors.Is(err, whatsmeow.ErrProfilePictureUnauthorized) {
			if cerr := a.store.SetAvatar(ctx, jid, "", ""); cerr != nil {
				logger.DebugCF("whatsapp", "avatar: failed to clear cache", map[string]any{
					"jid":   jid,
					"error": cerr.Error(),
				})
			}
			return nil, err
		}
		return nil, err
	}

	url := ""
	picID := ""
	if pic != nil {
		url = pic.URL
		picID = pic.ID
	}
	if err := a.store.SetAvatar(ctx, jid, url, picID); err != nil {
		return nil, err
	}

	updated, _ := a.store.GetChat(ctx, jid)
	if updated != nil && a.pubsub != nil {
		a.pubsub.Publish(inboxEvent{Kind: "chat_update", Chat: updated})
	}
	return updated, nil
}

// allowAttempt returns true when enough time has passed since the last call
// for this JID. Forced refreshes (Picture event, manual reload) bypass the
// throttle but still update the timestamp so a flapping event doesn't lead
// to runaway calls.
func (a *avatarFetcher) allowAttempt(jid string, force bool) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	last, ok := a.lastAttempt[jid]
	if !force && ok && time.Since(last) < a.minInterval {
		return false
	}
	a.lastAttempt[jid] = time.Now()
	return true
}
