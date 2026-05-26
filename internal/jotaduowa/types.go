package jotaduowa

import "time"

// InboundMessage is the sidecar-local representation of a received WhatsApp
// message, decoupled from pkg/channels/whatsapp_native types so server.go +
// routing.go can compile without the whatsapp_native build tag.
type InboundMessage struct {
	ChatJID   string
	SenderJID string
	PushName  string
	MessageID string
	Content   string
	Timestamp time.Time
}

// InboundHandler is invoked for every inbound WhatsApp message.
type InboundHandler func(msg InboundMessage)
