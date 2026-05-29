package jotaduowa

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	hmacSigHeader = "X-Jotaduo-Wa-Signature"
	hmacMaxSkew   = 5 * time.Minute
	maxBodyBytes  = 1 << 20 // 1 MiB

	adminTokenHeader = "X-Jotaduo-WA-Admin-Token"
)

// ServerConfig groups the runtime dependencies the HTTP server needs.
type ServerConfig struct {
	HMACSecret string
	AdminToken string
	WhatsApp   WhatsAppSender
	Routing    *Routing
}

// WhatsAppSender is the HTTP server surface implemented by the sidecar
// WhatsApp wrapper. Tests use it to inject a fake sender without a real WA
// session.
type WhatsAppSender interface {
	IsRunning() bool
	IsPaired() bool
	Send(ctx context.Context, to string, text string) (SendResult, error)
	HealthHandler(w http.ResponseWriter, r *http.Request)
}

// Server exposes the sidecar's HTTP surface. Three audiences:
//   - tenants (POST /internal/wa/send + /internal/wa/routing) authenticated
//     by HMAC-SHA256 over the request body
//   - the controlplane (DELETE /internal/wa/routing/by-tenant/{id}) same HMAC
//   - the operator (GET /pair, GET /pair/qr) authenticated by an admin token
//     header — Traefik should also gate this with IP allow-list or basicauth
type Server struct {
	cfg ServerConfig

	// adminSessions holds opaque session IDs → expiration timestamps for
	// operators who authenticated via POST /pair/login. In-memory because
	// (a) the sidecar is single-instance and (b) sessions die naturally if
	// the process restarts (operator just re-logs in). 1h TTL.
	adminSessionsMu sync.Mutex
	adminSessions   map[string]time.Time
}

// NewServer builds a Server from its config.
func NewServer(cfg ServerConfig) *Server {
	return &Server{
		cfg:           cfg,
		adminSessions: make(map[string]time.Time),
	}
}

// checkAdminSession returns true if sessionID is valid + unexpired.
// Lazy cleanup: prunes the entry if expired.
func (s *Server) checkAdminSession(sessionID string) bool {
	s.adminSessionsMu.Lock()
	defer s.adminSessionsMu.Unlock()
	exp, ok := s.adminSessions[sessionID]
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		delete(s.adminSessions, sessionID)
		return false
	}
	return true
}

// newAdminSession allocates an opaque session ID and stores it with
// adminSessionTTL expiration. Returns the cookie value the caller should
// set on the response.
func (s *Server) newAdminSession() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	id := hex.EncodeToString(buf[:])
	s.adminSessionsMu.Lock()
	defer s.adminSessionsMu.Unlock()
	s.adminSessions[id] = time.Now().Add(adminSessionTTL)
	return id, nil
}

// Handler returns the http.Handler with all routes mounted. The mux is built
// fresh each call (cheap) so callers can wrap it without state surprises.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/readyz", s.handleReadyz)

	mux.HandleFunc("/internal/wa/send", s.requireHMAC(s.handleSend))
	mux.HandleFunc("/internal/wa/routing", s.requireHMAC(s.handleRoutingRegister))
	mux.HandleFunc("/internal/wa/routing/by-tenant/", s.requireHMAC(s.handleRoutingByTenant))

	// Admin/pairing surface — gated by JOTADUO_WA_ADMIN_TOKEN, not HMAC.
	// /pair/login (POST only) accepts the token via form body, sets an
	// HttpOnly session cookie, redirects to /pair. /pair + /pair/qr then
	// check the cookie (or the header for scripts). Tokens NEVER appear
	// in URLs — audit P0 from RELATORIO-GAPS-AUDIT-2026-05-27.
	mux.HandleFunc("/pair", s.handlePairOrLogin)
	mux.HandleFunc("/pair/login", s.handlePairLogin)
	mux.HandleFunc("/pair/qr", s.requireAdminToken(s.handlePairQR))

	return mux
}

// handleHealthz is a liveness probe: 200 as long as the process is up.
func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReadyz reports whether the sidecar can serve send/receive: WA must be
// running AND paired. Used by docker-compose healthchecks so dependent tenant
// containers can wait until the sidecar is actually usable.
func (s *Server) handleReadyz(w http.ResponseWriter, _ *http.Request) {
	wa := s.cfg.WhatsApp
	if wa == nil || !wa.IsRunning() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "not_running",
		})
		return
	}
	if !wa.IsPaired() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "unpaired",
			"hint":   "scan QR at /pair",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (s *Server) handlePairQR(w http.ResponseWriter, r *http.Request) {
	wa := s.cfg.WhatsApp
	if wa == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "not_running",
		})
		return
	}
	wa.HealthHandler(w, r)
}

// sendRequest is the body of POST /internal/wa/send.
type sendRequest struct {
	TenantID  string `json:"tenant_id"`
	To        string `json:"to"`
	Text      string `json:"text"`
	Timestamp int64  `json:"ts"`
}

func (s *Server) handleSend(w http.ResponseWriter, r *http.Request, body []byte) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req sendRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.TenantID = strings.TrimSpace(req.TenantID)
	req.To = strings.TrimSpace(req.To)
	req.Text = strings.TrimSpace(req.Text)
	if req.TenantID == "" || req.To == "" || req.Text == "" {
		writeError(w, http.StatusBadRequest, "tenant_id, to, text required")
		return
	}
	if !timestampFresh(req.Timestamp) {
		writeError(w, http.StatusUnauthorized, "stale timestamp")
		return
	}
	wa := s.cfg.WhatsApp
	if wa == nil || !wa.IsPaired() {
		writeError(w, http.StatusServiceUnavailable, "whatsapp not paired")
		return
	}

	// Auto-register the routing so the lead's reply lands back in the same
	// tenant without the skill needing a second HTTP call. Tenants can still
	// call /internal/wa/routing explicitly to bind extra numbers.
	s.registerRoutingAliases(r.Context(), req.TenantID, req.To)

	result, err := wa.Send(r.Context(), req.To, req.Text)
	if err != nil {
		log.Printf("jotaduo-wa: send failed (tenant=%s to=%s): %v", req.TenantID, req.To, err)
		writeError(w, http.StatusBadGateway, "send failed: "+err.Error())
		return
	}
	s.registerRoutingAliases(r.Context(), req.TenantID, result.RouteAliases...)
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "sent",
		"message_ids": result.MessageIDs,
		"tenant_id":   req.TenantID,
	})
}

func (s *Server) registerRoutingAliases(ctx context.Context, tenantID string, aliases ...string) {
	if s.cfg.Routing == nil {
		return
	}
	seen := make(map[string]struct{}, len(aliases))
	for _, alias := range aliases {
		alias = strings.TrimSpace(alias)
		if alias == "" {
			continue
		}
		if _, ok := seen[alias]; ok {
			continue
		}
		seen[alias] = struct{}{}
		if err := s.cfg.Routing.Register(ctx, alias, tenantID); err != nil {
			log.Printf("jotaduo-wa: auto-register routing failed (tenant=%s alias=%s): %v",
				tenantID, alias, err)
		}
	}
}

// routingRegisterRequest is the body of POST /internal/wa/routing.
type routingRegisterRequest struct {
	TenantID  string `json:"tenant_id"`
	Phone     string `json:"phone"`
	Timestamp int64  `json:"ts"`
}

func (s *Server) handleRoutingRegister(w http.ResponseWriter, r *http.Request, body []byte) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req routingRegisterRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if !timestampFresh(req.Timestamp) {
		writeError(w, http.StatusUnauthorized, "stale timestamp")
		return
	}
	if err := s.cfg.Routing.Register(r.Context(), req.Phone, req.TenantID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "registered"})
}

// handleRoutingByTenant dispatches GET (list routes) and DELETE (revoke all)
// for the by-tenant subtree.
func (s *Server) handleRoutingByTenant(w http.ResponseWriter, r *http.Request, _ []byte) {
	tenantID := strings.TrimPrefix(r.URL.Path, "/internal/wa/routing/by-tenant/")
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id missing in path")
		return
	}
	switch r.Method {
	case http.MethodGet:
		routes, err := s.cfg.Routing.ListByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"tenant_id": tenantID,
			"routes":    routes,
		})
	case http.MethodDelete:
		n, err := s.cfg.Routing.RevokeByTenant(r.Context(), tenantID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"tenant_id":      tenantID,
			"routes_removed": n,
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handlePairOrLogin is GET /pair. When the operator has a valid session
// cookie, serves the QR-polling pairHTML (the actual pairing UI). When
// missing/expired, serves loginHTML — a tiny form that POSTs the token
// to /pair/login. Keeps tokens out of URLs.
func (s *Server) handlePairOrLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if c, err := r.Cookie(adminSessionCookie); err == nil && c.Value != "" {
		if s.checkAdminSession(c.Value) {
			_, _ = w.Write([]byte(pairHTML))
			return
		}
	}
	_, _ = w.Write([]byte(loginHTML))
}

// handlePairLogin accepts POST /pair/login with the admin token in a form
// body (`token` field). Validates against cfg.AdminToken in constant time;
// on success allocates a session and sets an HttpOnly cookie, then 303s
// back to /pair (which will now render the QR UI via cookie auth).
func (s *Server) handlePairLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	want := strings.TrimSpace(s.cfg.AdminToken)
	if want == "" {
		writeError(w, http.StatusServiceUnavailable, "admin token not configured")
		return
	}
	if err := r.ParseForm(); err != nil {
		writeError(w, http.StatusBadRequest, "parse form")
		return
	}
	got := strings.TrimSpace(r.PostFormValue("token"))
	if subtle.ConstantTimeCompare([]byte(want), []byte(got)) != 1 {
		// Same response shape as cookie/header rejection to avoid leaking
		// "is the endpoint enabled?" vs "is my token wrong?" distinction.
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID, err := s.newAdminSession()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session alloc failed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     adminSessionCookie,
		Value:    sessionID,
		Path:     "/pair",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(adminSessionTTL.Seconds()),
	})
	http.Redirect(w, r, "/pair", http.StatusSeeOther)
}

// requireHMAC wraps a handler with HMAC-SHA256 body verification. Handlers
// receive the already-read body slice so they don't need to re-read r.Body.
func (s *Server) requireHMAC(next func(http.ResponseWriter, *http.Request, []byte)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(s.cfg.HMACSecret)
		if secret == "" {
			writeError(w, http.StatusServiceUnavailable, "hmac secret not configured")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
		if err != nil {
			writeError(w, http.StatusBadRequest, "read body")
			return
		}
		sig := strings.TrimSpace(r.Header.Get(hmacSigHeader))
		if !verifyHMAC(body, sig, secret) {
			writeError(w, http.StatusUnauthorized, "bad signature")
			return
		}
		next(w, r, body)
	}
}

// adminSessionCookie carries the proof that the operator already authenticated
// at POST /pair/login. The cookie value is opaque; we just check that it
// matches the live in-memory session map. HttpOnly + Secure + SameSite=Strict
// — the token NEVER appears in URLs (audit P0 from RELATORIO-GAPS-AUDIT-2026-05-27).
const adminSessionCookie = "jotaduo_wa_admin_session"

// adminSessionTTL caps how long an operator stays logged in to /pair. Short
// because the pairing flow is a brief one-time operation; if the operator
// walks away, they re-authenticate.
const adminSessionTTL = 60 * time.Minute

// requireAdminToken wraps a handler with a constant-time admin-token check.
// Auth sources accepted (in order):
//  1. HttpOnly session cookie set by a prior successful POST /pair/login
//  2. X-Jotaduo-WA-Admin-Token header (for curl/scripted use)
//
// Query-string ?token= fallback was REMOVED — tokens in URLs leak via Traefik
// access logs, browser history, and SSH bastion logs.
func (s *Server) requireAdminToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		want := strings.TrimSpace(s.cfg.AdminToken)
		if want == "" {
			writeError(w, http.StatusServiceUnavailable, "admin token not configured")
			return
		}

		// Cookie path — preferred for browser-driven UI.
		if c, err := r.Cookie(adminSessionCookie); err == nil && c.Value != "" {
			if s.checkAdminSession(c.Value) {
				next(w, r)
				return
			}
		}

		// Header path — for curl, scripts, automated checks.
		if got := strings.TrimSpace(r.Header.Get(adminTokenHeader)); got != "" {
			if subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1 {
				next(w, r)
				return
			}
		}

		writeError(w, http.StatusUnauthorized, "unauthorized")
	}
}

// verifyHMAC returns true iff sigHex is the hex-encoded HMAC-SHA256 of body
// using secret. Constant-time compare.
func verifyHMAC(body []byte, sigHex, secret string) bool {
	if sigHex == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	got, err := hex.DecodeString(sigHex)
	if err != nil {
		return false
	}
	return hmac.Equal(expected, got)
}

// timestampFresh rejects request timestamps more than hmacMaxSkew off from now
// to prevent replay of captured requests. ts==0 is treated as missing and
// rejected; callers must always include the current time.
func timestampFresh(ts int64) bool {
	if ts == 0 {
		return false
	}
	now := time.Now().Unix()
	delta := now - ts
	if delta < 0 {
		delta = -delta
	}
	return delta <= int64(hmacMaxSkew.Seconds())
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// loginHTML is shown by GET /pair when the request has no valid session
// cookie. Tiny form that POSTs the token to /pair/login; on success the
// server sets an HttpOnly cookie and 303s back to /pair (which now renders
// pairHTML below).
const loginHTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Jotaduo WhatsApp — Login</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 380px; margin: 4rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.25rem; }
  form { display: grid; gap: 0.75rem; margin-top: 1rem; }
  input { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 1rem; font-family: ui-monospace, monospace; }
  button { padding: 0.5rem 1rem; background: #111; color: white; border: 0; border-radius: 6px; cursor: pointer; font-size: 1rem; }
  .hint { font-size: 0.85rem; color: #6b7280; }
</style>
</head>
<body>
<h1>Jotaduo WhatsApp — Login</h1>
<p class="hint">Cole o admin token (JOTADUO_WA_ADMIN_TOKEN do .env) pra acessar a UI de pareamento. O token NÃO vai na URL — vai no body do POST, fica como cookie HttpOnly por 60min.</p>
<form method="POST" action="/pair/login" autocomplete="off">
  <input name="token" type="password" required autofocus placeholder="cole o admin token">
  <button type="submit">Entrar</button>
</form>
</body>
</html>`

// pairHTML is the QR-pairing UI. Polls /pair/qr every 2s. Auth via the
// HttpOnly session cookie set by POST /pair/login (no token in URL).
const pairHTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Jotaduo WhatsApp — Pareamento</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.25rem; }
  .qr { width: 320px; height: 320px; background: #f3f4f6; display: grid; place-items: center; margin: 1rem 0; border-radius: 8px; }
  .qr img { width: 100%; height: auto; }
  .status { font-size: 0.875rem; color: #6b7280; }
  .status.ok { color: #059669; }
  .status.err { color: #dc2626; }
  code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 4px; }
</style>
</head>
<body>
<h1>Jotaduo WhatsApp — Pareamento</h1>
<p>Escaneie o QR abaixo com o WhatsApp do número institucional do Jotaduo (Configurações → Aparelhos conectados → Conectar um aparelho).</p>
<div class="qr" id="qr">aguardando…</div>
<p class="status" id="status">conectando…</p>
<script>
// Auth carries via HttpOnly session cookie set by POST /pair/login.
// credentials:'same-origin' ensures the cookie is sent on fetch.
async function poll() {
  try {
    const r = await fetch('/pair/qr', { cache: 'no-store', credentials: 'same-origin' });
    const data = await r.json();
    const qr = document.getElementById('qr');
    const status = document.getElementById('status');
    if (data.status === 'wait' && data.qr_data_uri) {
      qr.innerHTML = '<img src="' + data.qr_data_uri + '" alt="QR">';
      status.textContent = 'aguardando você escanear (expira em breve)';
      status.className = 'status';
    } else if (data.status === 'confirmed') {
      qr.innerHTML = '✓';
      status.textContent = 'pareado: ' + (data.phone_number || 'OK');
      status.className = 'status ok';
    } else if (data.status === 'error') {
      qr.innerHTML = '×';
      status.textContent = 'erro: ' + (data.error || 'desconhecido');
      status.className = 'status err';
    } else {
      qr.innerHTML = '…';
      status.textContent = data.status || 'aguardando';
      status.className = 'status';
    }
  } catch (e) {
    document.getElementById('status').textContent = 'erro de rede: ' + e.message;
    document.getElementById('status').className = 'status err';
  }
}
poll();
setInterval(poll, 2000);
</script>
</body>
</html>`
