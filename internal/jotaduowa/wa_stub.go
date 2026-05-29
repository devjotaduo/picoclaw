//go:build !whatsapp_native

package jotaduowa

import (
	"context"
	"errors"
	"net/http"
)

// WhatsApp stub for builds without the whatsapp_native tag. The sidecar
// binary always requires the tag; this stub exists so `go vet ./...` and IDE
// tools can compile the package without pulling in whatsmeow + sqlite.
type WhatsApp struct{}

var errStub = errors.New("whatsapp_native build tag not enabled")

func NewWhatsApp(string) (*WhatsApp, error)        { return nil, errStub }
func (*WhatsApp) SetInboundHandler(InboundHandler) {}
func (*WhatsApp) Start(context.Context) error      { return errStub }
func (*WhatsApp) Stop(context.Context) error       { return nil }
func (*WhatsApp) IsRunning() bool                  { return false }
func (*WhatsApp) IsPaired() bool                   { return false }
func (*WhatsApp) Send(context.Context, string, string) (SendResult, error) {
	return SendResult{}, errStub
}
func (*WhatsApp) HealthHandler(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, errStub.Error(), http.StatusServiceUnavailable)
}
