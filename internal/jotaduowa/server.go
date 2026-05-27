package jotaduowa

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	hmacSigHeader = "X-Jotaduo-WA-Signature"
	hmacMaxSkew   = 5 * time.Minute
	maxBodyBytes  = 1 << 20 // 1 MiB

	adminTokenHeader = "X-Jotaduo-WA-Admin-Token"
)

// ServerConfig groups the runtime dependencies the HTTP server needs.
type ServerConfig struct {
	HMACSecret string
	AdminToken string
	WhatsApp   *WhatsApp
	Routing    *Routing
}

// Server exposes the sidecar's HTTP surface. Three audiences:
//   - tenants (POST /internal/wa/send + /internal/wa/routing) authenticated
//     by HMAC-SHA256 over the request body
//   - the controlplane (DELETE /internal/wa/routing/by-tenant/{id}) same HMAC
//   - the operator (GET /pair, GET /pair/qr) authenticated by an admin token
//     header — Traefik should also gate this with IP allow-list or basicauth
type Server struct {
	cfg ServerConfig
}

// NewServer builds a Server from its config.
func NewServer(cfg ServerConfig) *Server {
	return &Server{cfg: cfg}
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
	mux.HandleFunc("/pair", s.requireAdminToken(s.handlePair))
	mux.HandleFunc("/pair/qr", s.requireAdminToken(s.cfg.WhatsApp.HealthHandler))

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
	if !s.cfg.WhatsApp.IsPaired() {
		writeError(w, http.StatusServiceUnavailable, "whatsapp not paired")
		return
	}

	// Auto-register the routing so the lead's reply lands back in the same
	// tenant without the skill needing a second HTTP call. Tenants can still
	// call /internal/wa/routing explicitly to bind extra numbers.
	if err := s.cfg.Routing.Register(r.Context(), req.To, req.TenantID); err != nil {
		log.Printf("jotaduo-wa: auto-register routing failed (tenant=%s to=%s): %v",
			req.TenantID, req.To, err)
		// Non-fatal — the send itself can still succeed.
	}

	ids, err := s.cfg.WhatsApp.Send(r.Context(), req.To, req.Text)
	if err != nil {
		log.Printf("jotaduo-wa: send failed (tenant=%s to=%s): %v", req.TenantID, req.To, err)
		writeError(w, http.StatusBadGateway, "send failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "sent",
		"message_ids": ids,
		"tenant_id":   req.TenantID,
	})
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
			"tenant_id":     tenantID,
			"routes_removed": n,
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handlePair serves a minimal HTML page that polls /pair/qr and renders the
// QR. Keeps the operator workflow self-contained: open the URL, scan, done.
func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(pairHTML))
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

// requireAdminToken wraps a handler with a constant-time admin-token check.
// Used for the pairing UI; HMAC isn't appropriate here because the operator
// hitting the URL from a browser can't sign arbitrary requests.
func (s *Server) requireAdminToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		want := strings.TrimSpace(s.cfg.AdminToken)
		if want == "" {
			writeError(w, http.StatusServiceUnavailable, "admin token not configured")
			return
		}
		got := strings.TrimSpace(r.Header.Get(adminTokenHeader))
		if got == "" {
			// Allow ?token=... fallback so the operator can paste a link in
			// the browser without needing a custom header tool.
			got = strings.TrimSpace(r.URL.Query().Get("token"))
		}
		if subtle.ConstantTimeCompare([]byte(want), []byte(got)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
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

// pairHTML is the QR-pairing UI. Polls /pair/qr every 2 seconds with the same
// admin token (via the URL query) and renders the data URI in an <img>.
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
const token = new URLSearchParams(location.search).get('token');
async function poll() {
  try {
    const r = await fetch('/pair/qr?token=' + encodeURIComponent(token || ''), { cache: 'no-store' });
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
