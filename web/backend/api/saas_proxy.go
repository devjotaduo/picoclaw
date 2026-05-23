package api

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
)

var (
	saasClientOnce sync.Once
	saasClient     *saasAdminClient
	saasClientErr  error
)

func getSaaSAdminClient() (*saasAdminClient, error) {
	saasClientOnce.Do(func() {
		saasClient, saasClientErr = newSaaSAdminClient(loadSaaSAdminConfig())
	})
	return saasClient, saasClientErr
}

// registerSaaSProxyRoutes wires /api/admin/saas/* to a thin proxy that talks
// to the controlplane on behalf of the dashboard-authenticated user. The
// launcher reuses the user's local launcher session for authentication; the
// controlplane credentials live in env vars (see SaaSAdminConfig).
//
// The path after /api/admin/saas/ is appended to /api/v1/ on the controlplane
// side, so `/api/admin/saas/tenants` -> `<base>/api/v1/tenants`.
func (h *Handler) registerSaaSProxyRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/admin/saas/", h.handleSaaSProxy)
}

func (h *Handler) handleSaaSProxy(w http.ResponseWriter, r *http.Request) {
	client, err := getSaaSAdminClient()
	if err != nil {
		writeSaaSProxyError(w, http.StatusInternalServerError, err.Error())
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/saas")
	if rest == "" {
		rest = "/"
	}
	target := "/api/v1" + rest
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	var body []byte
	if r.Body != nil && r.ContentLength != 0 {
		// MaxBytesReader keeps a runaway upload from filling memory; tune if
		// any future admin endpoint legitimately needs more.
		const maxBody = 10 << 20 // 10 MiB
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			writeSaaSProxyError(w, http.StatusRequestEntityTooLarge, "request body too large or unreadable")
			return
		}
		body = b
	}

	res, err := client.Do(r.Context(), r.Method, target, body)
	if err != nil {
		writeSaaSProxyError(w, http.StatusBadGateway, "controlplane request failed: "+err.Error())
		return
	}
	defer res.Body.Close()

	// Forward only JSON/text; never leak Set-Cookie (controlplane sessions
	// are server-side state of the launcher, not of the browser).
	if ct := res.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(res.StatusCode)
	_, _ = io.Copy(w, res.Body)
}

func writeSaaSProxyError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Hand-roll JSON to avoid pulling encoding/json in this hot path.
	escaped := strings.ReplaceAll(msg, `"`, `\"`)
	_, _ = w.Write([]byte(`{"error":"` + escaped + `"}`))
}

// Compile-time assertion so we keep depending on errors.New (used by the
// init function in saas_client.go).
var _ = errors.New
