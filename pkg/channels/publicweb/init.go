package publicweb

import (
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/config"
)

// init registers the public-web channel factory under the canonical name
// "public-web".
//
// As of Phase 4, the pkg/config channel registry does not yet know about
// the publicweb settings type. The factory therefore tolerates a missing
// or non-decodable config entry: it falls back to defaultSettings() so
// the launcher can construct the channel for direct (non-config-driven)
// invocation by the Phase 5 HTTP layer. When Phase 5/8 introduces
// config.ChannelPublicWeb + a registered PublicWebSettings prototype,
// this factory will start receiving fully-populated settings.
func init() {
	channels.RegisterFactory(
		ChannelName,
		func(channelName, channelType string, cfg *config.Config, b *bus.MessageBus) (channels.Channel, error) {
			var settings *Settings

			if cfg != nil {
				if bc, ok := cfg.Channels[channelName]; ok && bc != nil {
					if decoded, err := bc.GetDecoded(); err == nil {
						if s, ok := decoded.(*Settings); ok {
							settings = s
						}
					}
				}
			}

			ch := NewChannel(b, settings)
			if channelName != ChannelName {
				ch.SetName(channelName)
			}
			return ch, nil
		},
	)
}
