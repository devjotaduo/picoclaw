//go:build whatsapp_native

package whatsapp

import (
	"context"
	"time"

	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// persistingObserver implements MessageObserver: writes every inbound and
// outbound message to the SQLite inbox store and publishes the resulting
// state to the pubsub for SSE clients.
//
// The store and pubsub belong to the channel and outlive any individual
// reconnection; this observer is created once per channel.
type persistingObserver struct {
	store  *inbox.Store
	pubsub *inboxPubSub
}

func newPersistingObserver(store *inbox.Store, pubsub *inboxPubSub) *persistingObserver {
	return &persistingObserver{store: store, pubsub: pubsub}
}

func (o *persistingObserver) OnInbound(ctx context.Context, evt InboundObservation) {
	if o.store == nil {
		return
	}
	msg := inbox.Message{
		MessageID: evt.MessageID,
		ChatJID:   evt.ChatJID,
		SenderJID: evt.SenderJID,
		Direction: inbox.DirectionIn,
		Source:    inbox.SourceContact,
		Content:   evt.Content,
		TS:        unixMilliOrNow(evt.Timestamp),
		Delivered: true,
	}
	if err := o.store.RecordMessage(ctx, msg, evt.PushName); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to persist inbound", map[string]any{
			"chat_jid": evt.ChatJID,
			"error":    err.Error(),
		})
		return
	}
	o.publish(ctx, evt.ChatJID, msg)
}

func (o *persistingObserver) OnOutbound(ctx context.Context, evt OutboundObservation) {
	if o.store == nil {
		return
	}
	source := evt.Source
	if source == "" {
		source = inbox.SourceAgent
	}
	msg := inbox.Message{
		MessageID: evt.MessageID,
		ChatJID:   evt.ChatJID,
		Direction: inbox.DirectionOut,
		Source:    source,
		Content:   evt.Content,
		TS:        unixMilliOrNow(evt.Timestamp),
		Delivered: evt.Error == nil,
	}
	if evt.Error != nil {
		msg.Error = evt.Error.Error()
	}
	// Outbound from the agent shouldn't change push_name; pass "" so the
	// upsert COALESCEs to whatever is already stored.
	if err := o.store.RecordMessage(ctx, msg, ""); err != nil {
		logger.WarnCF("whatsapp", "inbox: failed to persist outbound", map[string]any{
			"chat_jid": evt.ChatJID,
			"error":    err.Error(),
		})
		return
	}
	o.publish(ctx, evt.ChatJID, msg)
}

func (o *persistingObserver) publish(ctx context.Context, jid string, msg inbox.Message) {
	if o.pubsub == nil {
		return
	}
	chat, err := o.store.GetChat(ctx, jid)
	if err != nil || chat == nil {
		// Still emit the message so the UI can append it; chat metadata
		// will catch up on the next snapshot.
		o.pubsub.Publish(inboxEvent{Kind: "message", Message: &msg})
		return
	}
	o.pubsub.Publish(inboxEvent{Kind: "message", Message: &msg, Chat: chat})
}

func unixMilliOrNow(t time.Time) int64 {
	if t.IsZero() {
		return time.Now().UnixMilli()
	}
	return t.UnixMilli()
}
