//go:build whatsapp_native

package whatsapp

import (
	"sync"

	"github.com/sipeed/picoclaw/pkg/channels/whatsapp_native/inbox"
)

// inboxEvent is the unit pushed to SSE subscribers. The Kind drives client
// rendering: "message" for a new persisted message, "chat_update" when only
// the chat row changed (pause toggle, avatar refresh, mark-read).
type inboxEvent struct {
	Kind    string          `json:"kind"`
	Chat    *inbox.Chat     `json:"chat,omitempty"`
	Message *inbox.Message  `json:"message,omitempty"`
}

// inboxPubSub fans out inboxEvent to every active SSE subscriber. Subscribers
// are non-blocking — slow clients drop events rather than back-pressuring the
// channel hot path.
type inboxPubSub struct {
	mu   sync.RWMutex
	subs map[chan inboxEvent]struct{}
}

func newInboxPubSub() *inboxPubSub {
	return &inboxPubSub{subs: make(map[chan inboxEvent]struct{})}
}

func (p *inboxPubSub) Subscribe() (<-chan inboxEvent, func()) {
	ch := make(chan inboxEvent, 32)
	p.mu.Lock()
	p.subs[ch] = struct{}{}
	p.mu.Unlock()
	return ch, func() {
		p.mu.Lock()
		if _, ok := p.subs[ch]; ok {
			delete(p.subs, ch)
			close(ch)
		}
		p.mu.Unlock()
	}
}

func (p *inboxPubSub) Publish(evt inboxEvent) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	for ch := range p.subs {
		select {
		case ch <- evt:
		default:
			// Subscriber is too slow; drop the event rather than stalling
			// the producer. SSE clients reconnect and refetch on miss.
		}
	}
}
