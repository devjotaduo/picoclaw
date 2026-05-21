// Package publicweb implements the public-web channel adapter: a stateless
// SSE (Server-Sent Events) front-end for anonymous visitors that arrives via
// the launcher's HTTP layer (Phase 5: /api/public/chat and
// /api/public/chat/stream).
//
// Visitor identity is derived from sha256(session_cookie + "|" + ip)[:8] and
// prefixed with "public-web:" so the agent memory layer never sees the raw
// cookie. The allowlist is hard-coded to "*" because public chat is anonymous
// by design — rate limiting and captcha enforcement live at the HTTP layer.
package publicweb

// Settings is the (mostly informational) settings struct for the public-web
// channel. None of these knobs are enforced inside the channel itself; the
// HTTP handler in Phase 5 reads them to drive rate-limiting and captcha
// behavior, but storing them here keeps the configuration in one place.
type Settings struct {
	// RateLimitPerIP is the maximum number of inbound messages an IP may
	// send per minute. Enforced by the Phase 5 HTTP handler.
	RateLimitPerIP int `json:"rate_limit_per_ip" yaml:"rate_limit_per_ip"`

	// SessionTTLSeconds is the maximum idle time before a session is
	// considered expired and evicted from the in-memory map.
	SessionTTLSeconds int `json:"session_ttl_seconds" yaml:"session_ttl_seconds"`

	// RequireCaptchaHeader, when true, causes the HTTP handler to demand a
	// validated captcha proof header on every inbound POST. The channel
	// itself does not validate captchas; it only carries the flag.
	RequireCaptchaHeader bool `json:"require_captcha_header" yaml:"require_captcha_header"`
}

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
