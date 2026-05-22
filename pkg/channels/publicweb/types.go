// Package publicweb implements the public-web channel adapter: a stateless
// SSE (Server-Sent Events) front-end for anonymous visitors that arrives via
// the launcher's HTTP layer (Phase 5: /api/public/chat and
// /api/public/chat/stream).
//
// Visitor identity is derived from sha256(session_id + "|" + ip)[:8] and
// prefixed with "public-web:" so the agent memory layer never sees the raw
// session token. The session_id is whatever the HTTP layer supplies in the
// request body (POST /api/public/chat) or query string (GET /stream) — the
// frontend chooses how to mint it (browser session cookie, sessionStorage
// uuid, etc). The allowlist is hard-coded to "*" because public chat is
// anonymous by design — rate limiting and captcha enforcement live at the
// HTTP layer.
package publicweb

import "github.com/sipeed/picoclaw/pkg/config"

// Settings is the public-web channel's settings struct. It is now an alias
// of config.PublicWebSettings so the pkg/config validator and decoder
// recognise the "public-web" channel type as registered.
//
// Pre-Phase 5/8 this lived locally as its own struct because pkg/config
// didn't yet know about public-web; the factory in init.go fell back to
// defaultSettings() when no typed prototype was registered. With
// config.PublicWebSettings + the channelSettingsFactory entry in place,
// the factory now receives a fully-populated prototype.
type Settings = config.PublicWebSettings

// defaultSettings returns the baseline configuration used when no Settings
// are supplied (e.g. when the channel is constructed directly by tests or
// by a launcher that has not yet wired the config registry).
func defaultSettings() *Settings {
	return &Settings{
		RateLimitPerIP:       30,
		SessionTTLSeconds:    1800,
		RequireCaptchaHeader: false,
	}
}
