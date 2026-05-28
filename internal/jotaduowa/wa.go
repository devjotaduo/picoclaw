//go:build whatsapp_native

// Package jotaduowa wraps the in-tree whatsapp_native channel so it can run as
// a standalone sidecar service (see cmd/jotaduo-wa-sidecar). The wrapper hides
// the bus + config plumbing the channel was originally designed for, exposing
// only what the HTTP server needs: Send, HealthHandler (QR), and observer
// registration for inbound routing.
package jotaduowa

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/sipeed/picoclaw/pkg/bus"
	whatsapp "github.com/sipeed/picoclaw/pkg/channels/whatsapp_native"
	"github.com/sipeed/picoclaw/pkg/config"
)

// WhatsApp wraps the whatsapp_native channel for sidecar use. The exported
// methods are exactly what the HTTP layer needs; everything else (the bus,
// the BaseChannel, the inbox handler) is allocated internally and never leaks.
type WhatsApp struct {
	storeDir string
	channel  *whatsapp.WhatsAppNativeChannel
	bus      *bus.MessageBus

	mu       sync.RWMutex
	observer InboundHandler
}

// NewWhatsApp constructs a sidecar-flavored WhatsApp channel. The store SQLite
// lives at <storeDir>/whatsapp/store.db so the existing whatsapp_native init
// path is reused without changes.
func NewWhatsApp(storeDir string) (*WhatsApp, error) {
	if storeDir == "" {
		return nil, errors.New("storeDir is required")
	}

	// Channel needs a *config.Channel for shared BaseChannel construction. We
	// build the minimum required: name, no allow-list (sidecar trusts caller
	// auth via HMAC), default group trigger (irrelevant for outbound-driven
	// usage but the channel asserts mention-only when nothing is configured).
	bc := &config.Channel{
		Enabled: true,
		Type:    string(config.ChannelWhatsAppNative),
	}
	bc.SetName("whatsapp_native")

	cfg := &config.WhatsAppSettings{
		UseNative:        true,
		SessionStorePath: filepath.Join(storeDir, "whatsapp"),
	}

	// The sidecar has no agent subscribers; the bus exists only because the
	// channel publishes inbound to it. PublishInbound with no subscribers is
	// a no-op, which is exactly what we want — observers cover our needs.
	b := bus.NewMessageBus()

	ch, err := whatsapp.NewWhatsAppNativeChannel(bc, "whatsapp_native", cfg, b, cfg.SessionStorePath)
	if err != nil {
		return nil, fmt.Errorf("init whatsapp channel: %w", err)
	}
	concrete, ok := ch.(*whatsapp.WhatsAppNativeChannel)
	if !ok {
		return nil, fmt.Errorf("unexpected channel type %T", ch)
	}

	w := &WhatsApp{
		storeDir: storeDir,
		channel:  concrete,
		bus:      b,
	}

	concrete.AddObserver(&inboundForwarder{wa: w})
	return w, nil
}

// SetInboundHandler registers the callback the sidecar invokes for every
// inbound message. Replaces any prior handler.
func (w *WhatsApp) SetInboundHandler(h InboundHandler) {
	w.mu.Lock()
	w.observer = h
	w.mu.Unlock()
}

func (w *WhatsApp) inboundHandler() InboundHandler {
	w.mu.RLock()
	h := w.observer
	w.mu.RUnlock()
	return h
}

// Start begins the WhatsApp connection. Returns once Start completes; the QR
// flow (if unpaired) runs in a background goroutine and the QR data is
// available via HealthHandler.
func (w *WhatsApp) Start(ctx context.Context) error {
	return w.channel.Start(ctx)
}

// Stop disconnects and waits for goroutines.
func (w *WhatsApp) Stop(ctx context.Context) error {
	return w.channel.Stop(ctx)
}

// IsRunning reports whether the channel is currently connected.
func (w *WhatsApp) IsRunning() bool {
	return w.channel.IsRunning()
}

// IsPaired reports whether a device has been registered (QR scan completed).
// A running-but-unpaired channel cannot send messages.
func (w *WhatsApp) IsPaired() bool {
	client := w.channel.Client()
	return client != nil && client.Store != nil && client.Store.ID != nil
}

// Send dispatches an outbound text message to a phone number or full JID.
// Returns the WhatsApp message ID(s) and every address that should route
// replies back to the same tenant. WhatsApp can resolve phone-number sends to
// a LID JID, and inbound replies often arrive with that LID sender.
func (w *WhatsApp) Send(ctx context.Context, to, text string) (SendResult, error) {
	aliases := []string{to}
	if resolved, err := w.channel.ResolveSendDestination(ctx, to); err == nil {
		aliases = appendRouteAlias(aliases, resolved)
	}

	ids, err := w.channel.Send(ctx, bus.OutboundMessage{
		ChatID:  to,
		Content: text,
	})
	if err != nil {
		return SendResult{}, err
	}
	return SendResult{MessageIDs: ids, RouteAliases: aliases}, nil
}

func appendRouteAlias(aliases []string, candidate string) []string {
	if candidate == "" {
		return aliases
	}
	for _, alias := range aliases {
		if alias == candidate {
			return aliases
		}
	}
	return append(aliases, candidate)
}

// HealthHandler exposes the channel's built-in /qr + /disconnect routes so the
// sidecar can mount them under its admin namespace. See pkg/channels/
// whatsapp_native/whatsapp_native.go HealthHandler for the full path map.
func (w *WhatsApp) HealthHandler(rw http.ResponseWriter, r *http.Request) {
	w.channel.HealthHandler(rw, r)
}

// inboundForwarder implements whatsapp.MessageObserver and converts the
// channel's InboundObservation into the sidecar-local InboundMessage so the
// HTTP layer doesn't depend on whatsmeow types.
type inboundForwarder struct {
	wa *WhatsApp
}

func (f *inboundForwarder) OnInbound(_ context.Context, evt whatsapp.InboundObservation) {
	if h := f.wa.inboundHandler(); h != nil {
		h(InboundMessage{
			ChatJID:   evt.ChatJID,
			SenderJID: evt.SenderJID,
			PushName:  evt.PushName,
			MessageID: evt.MessageID,
			Content:   evt.Content,
			Timestamp: evt.Timestamp,
		})
	}
}

func (f *inboundForwarder) OnOutbound(_ context.Context, _ whatsapp.OutboundObservation) {
	// Outbound observations are not interesting for the sidecar: the HTTP
	// caller already knows what it sent (it got the message IDs back from
	// Send). Persisting outbound history is a tenant-side concern.
}
