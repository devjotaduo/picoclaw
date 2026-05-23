package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
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
//
// Role is optional and defaults to "public" (the lead-onboarding case the
// link was originally built for). Setting it to "tenant_owner" or
// "tenant_admin" makes the link grant that role on click — useful for
// password-less owner access from the admin panel. The HMAC signature
// covers the marshaled JSON, so the role field is tamper-proof; old
// tokens minted before this field existed deserialize with Role="" and
// fall through to the public default.
type magicLinkClaims struct {
	TenantID string `json:"tid"`
	Exp      int64  `json:"exp"`
	Nonce    string `json:"n"`
	Role     string `json:"r,omitempty"`
}

// magicLinkAllowedRoles is the whitelist of roles a magic link is allowed
// to carry. platform_admin / operator / viewer are deliberately excluded:
// platform_admin is controlplane-only (escaping that scope via a tenant
// link would be a privilege boundary break); operator/viewer aren't
// useful for a "log me in without a password" link and would just expand
// the attack surface.
var magicLinkAllowedRoles = map[string]bool{
	"":             true, // backward-compat alias of "public"
	"public":       true,
	"tenant_owner": true,
	"tenant_admin": true,
}

// normalizeMagicLinkRole trims+lowercases the input and validates against
// the whitelist. Returns (canonical, true) when accepted, ("", false)
// otherwise. Empty input is accepted and returns "" so the caller can
// treat it as "public" via signMagicVisitorRequest fallback.
func normalizeMagicLinkRole(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if !magicLinkAllowedRoles[s] {
		return "", false
	}
	return s, true
}

// magicLinkRoleTTLCap returns the max TTL allowed for a given role.
// Elevated roles get shorter caps so a leaked link's blast radius is
// bounded; public links keep the original 30-day cap because the worst a
// public visitor can do is chat with the agent.
func magicLinkRoleTTLCap(role string) time.Duration {
	switch role {
	case "tenant_owner":
		return 24 * time.Hour
	case "tenant_admin":
		return 7 * 24 * time.Hour
	default: // "", "public"
		return maxMagicLinkTTL
	}
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
// endpoint. All fields are optional — operator can POST {} and get
// defaults.
type magicLinkGenerateRequest struct {
	// TTLSeconds is the link's lifetime. Defaults to defaultMagicLinkTTL,
	// clamped to maxMagicLinkTTL (or to magicLinkRoleTTLCap when Role
	// asks for an elevated role).
	TTLSeconds int64 `json:"ttl_seconds,omitempty"`
	// IntakeID optionally ties the link to a specific company_intakes row.
	// When set, the onboarding-callback submit-intake handler auto-marks
	// every active link tied to this intake as consumed (the visitor will
	// see the thank-you page on any subsequent click).
	IntakeID string `json:"intake_id,omitempty"`
	// Role optionally elevates the link from the default "public" visitor
	// role to "tenant_owner" / "tenant_admin". Empty / "public" produces
	// the legacy lead-onboarding link. Validated against magicLinkAllowedRoles.
	Role string `json:"role,omitempty"`
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
		writeError(
			w,
			http.StatusServiceUnavailable,
			"controlplane has no PICOCLAW_SAAS_GATEWAY_SECRET configured; magic links require it",
		)
		return
	}

	var req magicLinkGenerateRequest
	// Body is optional; ignore decode errors for empty bodies.
	_ = json.NewDecoder(r.Body).Decode(&req)

	role, ok := normalizeMagicLinkRole(req.Role)
	if !ok {
		writeError(w, http.StatusBadRequest, "role must be one of: public, tenant_owner, tenant_admin")
		return
	}

	ttl := defaultMagicLinkTTL
	if req.TTLSeconds > 0 {
		ttl = time.Duration(req.TTLSeconds) * time.Second
	}
	if cap := magicLinkRoleTTLCap(role); ttl > cap {
		ttl = cap
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
		Role:     role,
	}
	token, err := signMagicLinkToken(h.Cfg.GatewaySharedSecret, claims)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sign: "+err.Error())
		return
	}

	// Persist a tracking row so we can flip the link to "consumed" on
	// intake submit (and revoke individually later). The HMAC signature
	// still gates access — this row is a side-channel for state changes
	// the client can't be trusted to obey.
	storeRow := &store.MagicLink{
		Nonce:     claims.Nonce,
		TenantID:  t.ID,
		ExpiresAt: time.Unix(claims.Exp, 0).UTC(),
	}
	if req.IntakeID != "" {
		intakeID := req.IntakeID
		storeRow.IntakeID = &intakeID
	}
	if h.MagicLinks != nil {
		if err := h.MagicLinks.Insert(r.Context(), storeRow); err != nil {
			writeError(w, http.StatusInternalServerError, "track link: "+err.Error())
			return
		}
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

	// Audit. Elevated roles (tenant_owner / tenant_admin) get the role
	// suffix on the action so SELECT WHERE action LIKE
	// 'tenant.magic_link.generate.tenant_owner' finds owner-grade mints
	// quickly. Public links keep the bare action for the lead funnel
	// dashboards.
	if h.Audit != nil {
		actor, _ := userFromContext(r.Context())
		var actorID *int64
		if actor != nil {
			actorID = &actor.ID
		}
		action := "tenant.magic_link.generate"
		if role != "" && role != "public" {
			action = "tenant.magic_link.generate." + role
		}
		_ = h.Audit.Insert(r.Context(), actorID, &t.ID, action, "magic_link", claims.Nonce)
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

	// Check the DB tracking row — if the link was consumed (intake submitted
	// or operator manually revoked), render a friendly thank-you page
	// instead of authenticating. Visitor sees the summary saved at consume
	// time. If MagicLinks isn't wired (e.g. test harness) we skip this
	// check and fall through to normal auth.
	if h.MagicLinks != nil {
		row, err := h.MagicLinks.Get(r.Context(), claims.Nonce)
		if errors.Is(err, store.ErrMagicLinkNotFound) {
			http.Error(w, "this access link is invalid or has expired", http.StatusUnauthorized)
			return true
		}
		if err != nil {
			http.Error(w, "magic link lookup failed", http.StatusInternalServerError)
			return true
		}
		if row.ConsumedAt != nil {
			renderMagicLinkConsumed(w, t, row)
			return true
		}
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
// off the request and returns the claims when present, valid, AND not
// marked consumed in the DB tracking row. The consumed check means a
// visitor who already has the cookie set loses access the moment Clara
// submits the intake (without waiting for cookie expiry).
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
	if h.MagicLinks != nil {
		row, err := h.MagicLinks.Get(r.Context(), claims.Nonce)
		if err != nil {
			return magicLinkClaims{}, false
		}
		if row.ConsumedAt != nil {
			return magicLinkClaims{}, false
		}
	}
	return claims, true
}

// renderMagicLinkConsumed writes the friendly thank-you page that replaces
// the dashboard when a visitor clicks an already-consumed link. Self-
// contained HTML — no SPA, no JS, works even when the launcher is down.
func renderMagicLinkConsumed(w http.ResponseWriter, t *store.Tenant, row *store.MagicLink) {
	summary := "Recebemos suas informações. Em breve um especialista vai entrar em contato."
	if row.Summary != nil && *row.Summary != "" {
		summary = *row.Summary
	}
	consumedAt := ""
	if row.ConsumedAt != nil {
		consumedAt = row.ConsumedAt.Format("02/01/2006 15:04")
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(magicLinkConsumedHTML(t.DisplayName, summary, consumedAt)))
}

func magicLinkConsumedHTML(tenantName, summary, consumedAt string) string {
	if tenantName == "" {
		tenantName = "Atendimento"
	}
	// Inline string concat keeps the page dependency-free (no template package
	// import, no embed). Style + structure intentionally minimal — this page
	// is rarely seen and shouldn't load anything from the launcher.
	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Obrigado — ` + html.EscapeString(tenantName) + `</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
         max-width: 560px; margin: 64px auto; padding: 0 24px; line-height: 1.55;
         color: #1a1a1a; background: #fafafa; }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: #161616; }
    .card { background: #1f1f1f; border-color: #2a2a2a; }
    .summary { background: #242424; border-color: #333; }
  }
  .card { border: 1px solid #e0e0e0; border-radius: 12px; padding: 32px; background: white; }
  h1 { margin: 0 0 8px; font-size: 1.4rem; }
  .lead { margin: 0 0 24px; color: #666; }
  .summary { background: #f6f6f6; border: 1px solid #eaeaea; border-radius: 8px;
             padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 0.95rem; }
  .meta { font-size: 0.8rem; color: #999; margin-top: 24px; border-top: 1px solid #eaeaea; padding-top: 16px; }
  .check { display: inline-flex; align-items: center; justify-content: center;
           width: 48px; height: 48px; border-radius: 50%; background: #22c55e;
           color: white; font-size: 1.5rem; margin-bottom: 16px; }
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Obrigado pelo seu contato!</h1>
    <p class="lead">` + html.EscapeString(tenantName) + ` recebeu suas informações com sucesso.</p>
    <div class="summary">` + html.EscapeString(summary) + `</div>
    <p>Em breve um especialista entrará em contato com você.
       Se precisar falar com a gente antes, é só responder à mensagem
       que você recebeu por WhatsApp ou e-mail.</p>
    <div class="meta">Conversa finalizada em ` + html.EscapeString(consumedAt) + `</div>
  </div>
</body>
</html>`
}

// signMagicVisitorRequest annotates the proxied request with trusted_gateway
// HMAC claims derived from the magic-link's signed payload. Honors
// claims.Role when present (whitelist-validated) and falls back to "public"
// for legacy tokens or unrecognized values.
//
// Identity propagation by role:
//   - "public" (or empty): UserID = "visitor:<nonce>", no email. This is
//     the lead-onboarding case — visitor is anonymous on purpose.
//   - Elevated ("tenant_owner" / "tenant_admin"): UserID =
//     "magic:<role>:<nonce>" and UserEmail = tenant.OwnerEmail so the
//     launcher's audit log distinguishes magic-link-owner from
//     password-owner. Without this, owner actions via magic link would
//     attribute to a synthetic visitor id — a real audit hole.
func (h *Handler) signMagicVisitorRequest(req *http.Request, t *store.Tenant, claims magicLinkClaims) {
	role, ok := normalizeMagicLinkRole(claims.Role)
	if !ok {
		// Defense in depth: a token whose JSON contained a role outside
		// the whitelist (e.g. forged by an attacker bypassing the
		// generate-time check, or a future role string this binary
		// doesn't know about) is downgraded silently to "public" rather
		// than refused — the worst we'd hand them is the same access a
		// stranger off the street gets.
		role = "public"
	}
	if role == "" {
		role = "public"
	}

	userID := "visitor:" + claims.Nonce
	userEmail := ""
	if role != "public" {
		userID = "magic:" + role + ":" + claims.Nonce
		userEmail = t.OwnerEmail
	}

	gatewayauth.AnnotateRequest(req, h.Cfg.GatewaySharedSecret, gatewayauth.Claims{
		TenantID:  t.ID,
		UserID:    userID,
		UserEmail: userEmail,
		Role:      role,
	}, time.Now())
}

// ── Manual consume endpoint ──────────────────────────────────────────

// magicLinkConsumeRequest is the admin body for marking a link consumed
// outside of the intake-submit auto-trigger. Both fields optional —
// summary defaults to a generic "we received your info" message.
type magicLinkConsumeRequest struct {
	Summary string `json:"summary,omitempty"`
}

// handleConsumeMagicLink lets the operator mark a magic link consumed
// without waiting for the intake-submit callback. Useful for ad-hoc links
// not tied to an intake, or to short-circuit a stuck conversation.
//
// Admin-only (router enforces requirePlatformAdmin).
func (h *Handler) handleConsumeMagicLink(w http.ResponseWriter, r *http.Request) {
	nonce := chi.URLParam(r, "nonce")
	if nonce == "" {
		writeError(w, http.StatusBadRequest, "nonce required")
		return
	}
	if h.MagicLinks == nil {
		writeError(w, http.StatusServiceUnavailable, "magic links store not configured")
		return
	}
	var req magicLinkConsumeRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := h.MagicLinks.MarkConsumed(r.Context(), nonce, req.Summary); err != nil {
		if err == store.ErrMagicLinkNotFound {
			writeError(w, http.StatusNotFound, "magic link not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "mark consumed: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── List magic links per tenant ──────────────────────────────────────
//
// Admins need visibility into which magic links are outstanding on a
// tenant so they can spot a leaked or forgotten owner-grade link and
// revoke it. The signed token itself isn't stored (only its HMAC-bound
// nonce + metadata), so the admin can't replay an existing link via
// this API — that's by design. The list is enough to (a) see the
// inventory at a glance and (b) target the consume endpoint by nonce.
//
// Returns at most 50 rows ordered by created_at DESC.

type magicLinkListItem struct {
	Nonce      string     `json:"nonce"`
	IntakeID   *string    `json:"intake_id,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
	Summary    *string    `json:"summary,omitempty"`
	// Active is true when the link is neither consumed nor expired —
	// i.e. it would actually let a visitor in right now.
	Active bool `json:"active"`
}

type magicLinkListResponse struct {
	TenantID string              `json:"tenant_id"`
	Links    []magicLinkListItem `json:"links"`
}

// handleListMagicLinks returns recent magic links for the tenant.
// Admin-only (router enforces requirePlatformAdmin).
func (h *Handler) handleListMagicLinks(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id required")
		return
	}
	if h.MagicLinks == nil {
		writeJSON(w, http.StatusOK, magicLinkListResponse{TenantID: id, Links: []magicLinkListItem{}})
		return
	}
	rows, err := h.MagicLinks.ListByTenant(r.Context(), id, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list magic links: "+err.Error())
		return
	}
	now := time.Now()
	out := make([]magicLinkListItem, 0, len(rows))
	for _, m := range rows {
		out = append(out, magicLinkListItem{
			Nonce:      m.Nonce,
			IntakeID:   m.IntakeID,
			CreatedAt:  m.CreatedAt,
			ExpiresAt:  m.ExpiresAt,
			ConsumedAt: m.ConsumedAt,
			Summary:    m.Summary,
			Active:     m.ConsumedAt == nil && now.Before(m.ExpiresAt),
		})
	}
	writeJSON(w, http.StatusOK, magicLinkListResponse{TenantID: id, Links: out})
}
