package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/gatewayauth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// magicLinkCookieName is the per-tenant cookie that holds a consumed magic
// link token. Scoped to the subdomain via the controlplane's COOKIE_DOMAIN
// so a token issued for tenant A cannot accidentally be replayed against
// tenant B even with the same name — the cookie value also embeds the
// tenant id and the verifier checks it matches the URL.
const magicLinkCookieName = "picoclaw_magic"

// defaultMagicLinkTTL is how long a freshly-generated link stays valid.
// Operators can override per-call when generating via API.
const defaultMagicLinkTTL = 24 * time.Hour

// maxMagicLinkTTL caps how long a single link can stay valid. 30 days is
// generous for "send link to lead, they may take a week to click" but
// short enough that a leaked link expires before becoming dangerous.
const maxMagicLinkTTL = 30 * 24 * time.Hour

// magicLinkClaims is the signed payload embedded in the URL token.
type magicLinkClaims struct {
	TenantID string `json:"tid"`
	Exp      int64  `json:"exp"`
	Nonce    string `json:"n"`
}

// signMagicLinkToken returns the URL-safe token "<base64 payload>.<base64 sig>"
// using HMAC-SHA256 with the GatewaySharedSecret as the key.
func signMagicLinkToken(secret string, claims magicLinkClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal: %w", err)
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encodedPayload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return encodedPayload + "." + sig, nil
}

// verifyMagicLinkToken parses + validates a token. Returns (claims, true)
// when valid; (zero, false) for any failure (bad shape, bad signature,
// expired, missing fields). Never reveals which check failed in the
// returned bool — caller doesn't need to know.
func verifyMagicLinkToken(secret, token string) (magicLinkClaims, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return magicLinkClaims{}, false
	}
	encodedPayload, sig := parts[0], parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encodedPayload))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return magicLinkClaims{}, false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return magicLinkClaims{}, false
	}
	var claims magicLinkClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return magicLinkClaims{}, false
	}
	if claims.TenantID == "" || claims.Exp == 0 {
		return magicLinkClaims{}, false
	}
	if time.Now().Unix() > claims.Exp {
		return magicLinkClaims{}, false
	}
	return claims, true
}

// magicLinkGenerateRequest is the optional body for the admin generate
// endpoint. Both fields are optional — operator can POST {} and get
// defaults.
type magicLinkGenerateRequest struct {
	// TTLSeconds is the link's lifetime. Defaults to defaultMagicLinkTTL,
	// clamped to maxMagicLinkTTL.
	TTLSeconds int64 `json:"ttl_seconds,omitempty"`
}

// magicLinkGenerateResponse is what the admin UI gets back.
type magicLinkGenerateResponse struct {
	URL       string    `json:"url"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// handleGenerateMagicLink mints a fresh signed magic link for the tenant
// identified in the URL. Admin-only (router enforces requirePlatformAdmin).
func (h *Handler) handleGenerateMagicLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id required")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	if h.Cfg.GatewaySharedSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "controlplane has no PICOCLAW_SAAS_GATEWAY_SECRET configured; magic links require it")
		return
	}

	var req magicLinkGenerateRequest
	// Body is optional; ignore decode errors for empty bodies.
	_ = json.NewDecoder(r.Body).Decode(&req)

	ttl := defaultMagicLinkTTL
	if req.TTLSeconds > 0 {
		ttl = time.Duration(req.TTLSeconds) * time.Second
	}
	if ttl > maxMagicLinkTTL {
		ttl = maxMagicLinkTTL
	}

	nonceBytes := make([]byte, 12)
	if _, err := rand.Read(nonceBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "rand: "+err.Error())
		return
	}
	claims := magicLinkClaims{
		TenantID: t.ID,
		Exp:      time.Now().Add(ttl).Unix(),
		Nonce:    base64.RawURLEncoding.EncodeToString(nonceBytes),
	}
	token, err := signMagicLinkToken(h.Cfg.GatewaySharedSecret, claims)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sign: "+err.Error())
		return
	}

	subdomain := t.Subdomain
	if subdomain == "" {
		subdomain = t.ID
	}
	linkURL := url.URL{
		Scheme: "https",
		Host:   subdomain + "." + h.Cfg.TenantBaseDomain,
		Path:   "/m/" + token,
	}

	writeJSON(w, http.StatusOK, magicLinkGenerateResponse{
		URL:       linkURL.String(),
		Token:     token,
		ExpiresAt: time.Unix(claims.Exp, 0).UTC(),
	})
}

// magicLinkPath is the URL path prefix used by clicked links. Format:
// /m/<token>. Detection lives in serveTenantHost (which calls
// consumeMagicLink before any auth check).
const magicLinkPath = "/m/"

// consumeMagicLink handles the click on a magic link. Validates the token,
// sets a per-tenant cookie carrying the same token (so subsequent requests
// from this browser session can authenticate without revealing the token in
// the URL bar after redirect), and redirects to the dashboard root.
//
// Returns (handled=true) when the path was magic-link-shaped; the caller
// must NOT continue normal request handling in that case (we've already
// written a response — either the redirect or an error page).
func (h *Handler) consumeMagicLink(w http.ResponseWriter, r *http.Request, t *store.Tenant) (handled bool) {
	if !strings.HasPrefix(r.URL.Path, magicLinkPath) {
		return false
	}
	token := strings.TrimPrefix(r.URL.Path, magicLinkPath)
	// Allow tokens with embedded slashes? No — our format has none, reject.
	if strings.Contains(token, "/") || token == "" {
		http.Error(w, "invalid magic link", http.StatusBadRequest)
		return true
	}
	if h.Cfg.GatewaySharedSecret == "" {
		http.Error(w, "controlplane misconfigured (no gateway secret)", http.StatusServiceUnavailable)
		return true
	}
	claims, ok := verifyMagicLinkToken(h.Cfg.GatewaySharedSecret, token)
	if !ok {
		http.Error(w, "this access link is invalid or has expired", http.StatusUnauthorized)
		return true
	}
	if claims.TenantID != t.ID {
		// Defence in depth: a link signed for tenant A clicked on tenant B's
		// subdomain must not authenticate. Should be impossible to forge a
		// valid HMAC for tenant B with A's payload (HMAC binds payload),
		// but explicit rejection beats silent acceptance.
		http.Error(w, "this access link is not valid for this tenant", http.StatusUnauthorized)
		return true
	}

	maxAge := claims.Exp - time.Now().Unix()
	if maxAge < 0 {
		maxAge = 0
	}
	http.SetCookie(w, &http.Cookie{
		Name:     magicLinkCookieName,
		Value:    token,
		Path:     "/",
		Domain:   h.Cfg.CookieDomain, // share across subdomains so tenant subdomain reads it
		MaxAge:   int(maxAge),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to dashboard root. Strip the token from the URL bar so the
	// visitor doesn't accidentally screenshot/share their session token.
	http.Redirect(w, r, "/", http.StatusFound)
	return true
}

// magicLinkClaimsFromCookie reads + validates the per-tenant magic cookie
// off the request and returns the claims when present and valid. Returns
// (zero, false) when no cookie, bad signature, or expired.
func (h *Handler) magicLinkClaimsFromCookie(r *http.Request, t *store.Tenant) (magicLinkClaims, bool) {
	c, err := r.Cookie(magicLinkCookieName)
	if err != nil {
		return magicLinkClaims{}, false
	}
	if h.Cfg.GatewaySharedSecret == "" {
		return magicLinkClaims{}, false
	}
	claims, ok := verifyMagicLinkToken(h.Cfg.GatewaySharedSecret, c.Value)
	if !ok {
		return magicLinkClaims{}, false
	}
	if claims.TenantID != t.ID {
		return magicLinkClaims{}, false
	}
	return claims, true
}

// signMagicVisitorRequest annotates the proxied request with trusted_gateway
// HMAC + visitor-role claims so the launcher accepts the request as if a
// real (anonymous) user had logged in via the dashboard.
func (h *Handler) signMagicVisitorRequest(req *http.Request, t *store.Tenant, claims magicLinkClaims) {
	gatewayauth.AnnotateRequest(req, h.Cfg.GatewaySharedSecret, gatewayauth.Claims{
		TenantID: t.ID,
		// Stable per-link visitor id so the agent memory layer can keep
		// session continuity across page reloads from the same browser.
		UserID: "visitor:" + claims.Nonce,
		Role:   "public",
	}, time.Now())
}
