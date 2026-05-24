package gateway

import (
	"slices"
	"testing"

	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
)

func TestGatewayRegistersPublicWebChannel(t *testing.T) {
	names := channels.GetRegisteredFactoryNames()
	if !slices.Contains(names, config.ChannelPublicWeb) {
		t.Fatalf("registered channel factories = %v, want %q", names, config.ChannelPublicWeb)
	}
}
