package api

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

const (
	tenantReadinessProbePath    = "/api/auth/status"
	tenantReadinessProbeTimeout = 3 * time.Second
)

var tenantReadinessHTTPClient = &http.Client{
	Timeout: tenantReadinessProbeTimeout,
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{
			// The probe targets the tenant launcher over the internal Docker
			// network (plain HTTP), so TLS verification normally doesn't apply.
			// Kept permissive in case a future caller points it at a self-signed
			// HTTPS endpoint — it's only a control-plane reachability check for
			// known tenant hosts derived from the database.
			InsecureSkipVerify: true,
		},
		IdleConnTimeout: 10 * time.Second,
	},
	CheckRedirect: func(_ *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return http.ErrUseLastResponse
		}
		return nil
	},
}

type tenantReadinessResponse struct {
	TenantID       string             `json:"tenant_id"`
	URL            string             `json:"url"`
	Status         store.TenantStatus `json:"status"`
	Ready          bool               `json:"ready"`
	SubdomainReady bool               `json:"subdomain_ready"`
	HTTPStatus     int                `json:"http_status,omitempty"`
	Error          string             `json:"error,omitempty"`
	LastError      *string            `json:"last_error,omitempty"`
	CheckedAt      time.Time          `json:"checked_at"`
}

// handleTenantReadiness verifies the tenant is ready for access: the DB
// provisioning status must be active and the tenant launcher must answer
// /api/auth/status over the internal Docker network.
//
// We deliberately probe the internal upstream (http://tenant-<id>:18800) — the
// same target the gateway proxies to — instead of the public HTTPS subdomain.
// The public path couples readiness to DNS, NAT hairpin, the tenant-router
// debounce and, worst of all, first-touch Let's Encrypt cert issuance, which
// for a brand-new subdomain routinely exceeds any sane probe timeout. That made
// the access-gate hang on "context deadline exceeded" forever. The internal
// route answers in <100ms once the launcher is listening, and /api/auth/status
// is auth-exempt (see isPublicLauncherDashboardPath), so an unsigned GET returns
// 200 — exactly the "container is serving" signal the gate needs. The customer's
// first browser visit triggers cert issuance lazily; nothing is lost by not
// blocking on it here.
func (h *Handler) handleTenantReadiness(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id is required")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "cliente não encontrado")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	resp := tenantReadinessResponse{
		TenantID:  t.ID,
		URL:       tenantURL(h.Cfg, t.Subdomain),
		Status:    t.Status,
		LastError: t.LastError,
		CheckedAt: time.Now().UTC(),
	}
	w.Header().Set("Cache-Control", "no-store")

	if t.Status != store.StatusActive {
		resp.Error = fmt.Sprintf("tenant ainda não está ativo: %s", t.Status)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	internalURL := h.tenantProxyTarget(r.Context(), t).String()
	status, err := probeTenantAuthStatus(r.Context(), internalURL)
	resp.HTTPStatus = status
	if err != nil {
		resp.Error = err.Error()
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp.Ready = true
	resp.SubdomainReady = true
	writeJSON(w, http.StatusOK, resp)
}

func probeTenantAuthStatus(ctx context.Context, baseURL string) (int, error) {
	probeURL := strings.TrimRight(baseURL, "/") + tenantReadinessProbePath
	ctx, cancel := context.WithTimeout(ctx, tenantReadinessProbeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")

	res, err := tenantReadinessHTTPClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusBadRequest {
		return res.StatusCode, fmt.Errorf("%s respondeu HTTP %d", tenantReadinessProbePath, res.StatusCode)
	}
	return res.StatusCode, nil
}
