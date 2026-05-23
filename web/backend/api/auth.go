package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/sipeed/picoclaw/web/backend/middleware"
)

// PasswordStore is the interface for dashboard password persistence.
// Implemented by dashboardauth.Store and launcherconfig.PasswordStore.
type PasswordStore interface {
	IsInitialized(ctx context.Context) (bool, error)
	SetPassword(ctx context.Context, plain string) error
	VerifyPassword(ctx context.Context, plain string) (bool, error)
}

// LauncherAuthRouteOpts configures dashboard auth handlers.
type LauncherAuthRouteOpts struct {
	SessionCookie string
	SecureCookie  func(*http.Request) bool
	// PasswordStore enables password login. It must be non-nil for auth to work.
	PasswordStore PasswordStore
	// StoreError holds the error returned when opening the password store. When
	// non-nil and PasswordStore is nil, auth endpoints fail closed with a
	// recovery message.
	StoreError error
	// AuthMode mirrors PICOCLAW_AUTH_MODE. When set to "trusted_gateway", the
	// dashboard password flow is bypassed: /api/auth/status reports authenticated
	// and initialized regardless of dashboardauth.db state because the upstream
	// controlplane is responsible for auth (SeedDashboardPassword is skipped
	// for Supabase-backed tenants, so the store stays empty by design).
	// Without this, the launcher SPA's session guard would see initialized=false
	// and redirect every request to /launcher-setup.
	AuthMode string
}

type launcherAuthLoginBody struct {
	Password string `json:"password"`
}

type launcherAuthSetupBody struct {
	Password string `json:"password"`
	Confirm  string `json:"confirm"`
}

type launcherAuthStatusResponse struct {
	Authenticated bool `json:"authenticated"`
	Initialized   bool `json:"initialized"`
}

// RegisterLauncherAuthRoutes registers /api/auth/login|logout|status|setup.
func RegisterLauncherAuthRoutes(mux *http.ServeMux, opts LauncherAuthRouteOpts) {
	secure := opts.SecureCookie
	if secure == nil {
		secure = middleware.DefaultLauncherDashboardSecureCookie
	}
	h := &launcherAuthHandlers{
		sessionCookie: opts.SessionCookie,
		secureCookie:  secure,
		store:         opts.PasswordStore,
		storeErr:      opts.StoreError,
		loginLimit:    newLoginRateLimiter(),
		authMode:      opts.AuthMode,
	}
	mux.HandleFunc("POST /api/auth/login", h.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", h.handleLogout)
	mux.HandleFunc("GET /api/auth/status", h.handleStatus)
	mux.HandleFunc("POST /api/auth/setup", h.handleSetup)
}

type launcherAuthHandlers struct {
	sessionCookie string
	secureCookie  func(*http.Request) bool
	store         PasswordStore
	storeErr      error // set when the store failed to open; drives recovery messages
	loginLimit    *loginRateLimiter
	// authMode mirrors PICOCLAW_AUTH_MODE; "trusted_gateway" short-circuits
	// /api/auth/status to authenticated+initialized=true (see field doc on
	// LauncherAuthRouteOpts for the why).
	authMode string
}

// isStoreInitialized safely queries the store.
// Returns (false, err) on store errors — callers must treat this as a 5xx, not as
// "uninitialized", to keep auth fail-closed.
func (h *launcherAuthHandlers) isStoreInitialized(ctx context.Context) (bool, error) {
	if h.store == nil {
		if h.storeErr != nil {
			return false, fmt.Errorf(
				"password store unavailable (%w); "+
					"to recover, stop the application, reset dashboard password storage, and restart",
				h.storeErr)
		}
		return false, fmt.Errorf("password store not configured")
	}
	return h.store.IsInitialized(ctx)
}

func (h *launcherAuthHandlers) handleLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var body launcherAuthLoginBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid JSON"}`))
		return
	}
	ip := clientIPForLimiter(r)
	if !h.loginLimit.allow(ip) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"too many login attempts"}`))
		return
	}
	in := strings.TrimSpace(body.Password)

	initialized, initErr := h.isStoreInitialized(r.Context())
	if initErr != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeErrorf(w, "%v", initErr)
		return
	}
	if !initialized {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"password has not been set"}`))
		return
	}

	ok, err := h.store.VerifyPassword(r.Context(), in)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeErrorf(w, "password verification failed: %v", err)
		return
	}
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid password"}`))
		return
	}

	middleware.SetLauncherDashboardSessionCookie(w, r, h.sessionCookie, h.secureCookie)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (h *launcherAuthHandlers) handleLogout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error":"method not allowed"}`))
		return
	}
	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if !strings.HasPrefix(ct, "application/json") {
		w.WriteHeader(http.StatusUnsupportedMediaType)
		_, _ = w.Write([]byte(`{"error":"Content-Type must be application/json"}`))
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, logoutBodyMaxBytes))
	if err := dec.Decode(&struct{}{}); err != nil && err != io.EOF {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid JSON body"}`))
		return
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid JSON body"}`))
		return
	}

	middleware.ClearLauncherDashboardSessionCookie(w, r, h.secureCookie)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (h *launcherAuthHandlers) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Trusted-gateway short-circuit: if /api/auth/status is being served at
	// all under trusted_gateway mode, the upstream LauncherDashboardAuth
	// middleware already verified the HMAC headers (unauthenticated requests
	// get rejected before reaching this handler). Report fully ready so the
	// SPA session guard doesn't redirect to /launcher-setup or /launcher-login.
	// dashboardauth.db state is irrelevant in this mode — the controlplane
	// owns auth.
	if strings.EqualFold(strings.TrimSpace(h.authMode), "trusted_gateway") {
		resp := launcherAuthStatusResponse{Authenticated: true, Initialized: true}
		enc, err := json.Marshal(resp)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			writeErrorf(w, "marshal response failed: %v", err)
			return
		}
		_, _ = w.Write(enc)
		return
	}
	// Local-mode hybrid: when the request reached us with valid trusted-gateway
	// claims in context, the controlplane already vouched for the caller —
	// same semantic guarantee as trusted_gateway mode, just unlocked per-request.
	// Without this, the SPA's session guard sees initialized=false (the
	// dashboardauth.db is empty for is_raw workspaces that ship no password)
	// and redirects HMAC-authenticated magic-link visitors to /launcher-setup.
	if _, ok := middleware.TrustedGatewayClaims(r); ok {
		resp := launcherAuthStatusResponse{Authenticated: true, Initialized: true}
		enc, err := json.Marshal(resp)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			writeErrorf(w, "marshal response failed: %v", err)
			return
		}
		_, _ = w.Write(enc)
		return
	}
	authed := false
	if c, err := r.Cookie(middleware.LauncherDashboardCookieName); err == nil {
		authed = subtle.ConstantTimeCompare([]byte(c.Value), []byte(h.sessionCookie)) == 1
	}
	initialized, initErr := h.isStoreInitialized(r.Context())
	if initErr != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeErrorf(w, "%v", initErr)
		return
	}
	resp := launcherAuthStatusResponse{
		Authenticated: authed,
		Initialized:   initialized,
	}
	enc, err := json.Marshal(resp)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeErrorf(w, "marshal response failed: %v", err)
		return
	}
	_, _ = w.Write(enc)
}

// handleSetup sets or changes the dashboard password.
//
// Rules:
//   - If the store has no password yet, anyone who can reach the setup endpoint
//     may initialize the password.
//   - If a password is already set, the caller must hold a valid session cookie.
func (h *launcherAuthHandlers) handleSetup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.store == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		if h.storeErr != nil {
			writeErrorf(w, "password store unavailable: %v", h.storeErr)
		} else {
			_, _ = w.Write([]byte(`{"error":"password store not configured"}`))
		}
		return
	}

	initialized, initErr := h.isStoreInitialized(r.Context())
	if initErr != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeErrorf(w, "%v", initErr)
		return
	}

	// If already initialized, require an active session (change-password flow).
	// In trusted-gateway mode the controlplane provides auth via HMAC headers
	// (validated by the middleware); no local session cookie is issued in that
	// path, so we also accept requests that carry valid gateway claims.
	if initialized {
		authed := false
		if c, err := r.Cookie(middleware.LauncherDashboardCookieName); err == nil {
			authed = subtle.ConstantTimeCompare([]byte(c.Value), []byte(h.sessionCookie)) == 1
		}
		if !authed {
			_, authed = middleware.TrustedGatewayClaims(r)
		}
		if !authed {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"must be authenticated to change password"}`))
			return
		}
	}

	var body launcherAuthSetupBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid JSON"}`))
		return
	}

	pw := strings.TrimSpace(body.Password)
	if pw == "" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"password must not be empty"}`))
		return
	}
	if pw != strings.TrimSpace(body.Confirm) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"passwords do not match"}`))
		return
	}
	if len([]rune(pw)) < 8 {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"password must be at least 8 characters"}`))
		return
	}

	if err := h.store.SetPassword(r.Context(), pw); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeErrorf(w, "failed to save password: %v", err)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// writeErrorf writes a JSON error response with a formatted message.
// json.Marshal is used to safely escape the message string.
func writeErrorf(w http.ResponseWriter, format string, args ...any) {
	msg, _ := json.Marshal(fmt.Sprintf(format, args...))
	_, _ = w.Write([]byte(`{"error":` + string(msg) + `}`))
}
