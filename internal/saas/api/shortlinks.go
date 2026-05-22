package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// defaultShortlinkTTL is what the admin gets when no explicit expiry is
// passed. 30 days is long enough for "send a magic link to a lead and
// give them a week to click", short enough that an unused link doesn't
// linger forever in the database.
const defaultShortlinkTTL = 30 * 24 * time.Hour

// maxShortlinkTTL caps operator-requested TTLs. 1 year is the longest a
// link should ever live — anything wanting longer is almost certainly a
// misconfiguration or a wrong unit conversion (ms vs s mistake).
const maxShortlinkTTL = 365 * 24 * time.Hour

// shortlinkCreateInsertRetries bounds how many times we retry on a
// duplicate code. With an 8-char alphabet of 56 chars, the birthday
// bound for a collision starts hitting at ~10M existing rows; 3
// retries covers any realistic database before the math gets
// pathological.
const shortlinkCreateInsertRetries = 3

type shortlinkCreateRequest struct {
	TargetURL  string `json:"target_url"`
	Label      string `json:"label,omitempty"`
	TTLSeconds int    `json:"ttl_seconds,omitempty"`
}

type shortlinkCreateResponse struct {
	Code      string    `json:"code"`
	ShortURL  string    `json:"short_url"`
	TargetURL string    `json:"target_url"`
	Label     string    `json:"label"`
	ExpiresAt time.Time `json:"expires_at"`
}

// handleCreateShortlink mints a new shortened URL. Admin-only (router
// enforces requirePlatformAdmin).
//
// POST /api/v1/shortlinks
//
//	body: { target_url, label?, ttl_seconds? }
//	resp: { code, short_url, target_url, label, expires_at }
func (h *Handler) handleCreateShortlink(w http.ResponseWriter, r *http.Request) {
	var req shortlinkCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}
	req.TargetURL = strings.TrimSpace(req.TargetURL)
	if req.TargetURL == "" {
		writeError(w, http.StatusBadRequest, "target_url is required")
		return
	}
	if u, err := url.Parse(req.TargetURL); err != nil || u.Scheme == "" || u.Host == "" {
		writeError(w, http.StatusBadRequest, "target_url must be an absolute URL")
		return
	}
	if h.Shortlinks == nil {
		writeError(w, http.StatusServiceUnavailable, "shortlink store not configured")
		return
	}

	ttl := defaultShortlinkTTL
	if req.TTLSeconds > 0 {
		ttl = time.Duration(req.TTLSeconds) * time.Second
	}
	if ttl > maxShortlinkTTL {
		ttl = maxShortlinkTTL
	}

	var creatorID *int64
	if actor, ok := userFromContext(r.Context()); ok {
		id := actor.ID
		creatorID = &id
	}

	sl, err := h.createShortlinkWithRetry(r.Context(), req.TargetURL, strings.TrimSpace(req.Label), ttl, creatorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create shortlink: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, shortlinkCreateResponse{
		Code:      sl.Code,
		ShortURL:  h.buildShortURL(sl.Code),
		TargetURL: sl.TargetURL,
		Label:     sl.Label,
		ExpiresAt: sl.ExpiresAt,
	})
}

// createShortlinkWithRetry handles the rare unique-violation when two
// concurrent inserts pick the same code. Up to N retries with fresh
// codes; each retry is a single DB roundtrip so worst-case latency
// stays in the ms range.
func (h *Handler) createShortlinkWithRetry(
	ctx context.Context,
	targetURL, label string,
	ttl time.Duration,
	creatorID *int64,
) (*store.Shortlink, error) {
	for i := 0; i < shortlinkCreateInsertRetries; i++ {
		code, err := store.GenerateCode(8)
		if err != nil {
			return nil, err
		}
		sl := &store.Shortlink{
			Code:      code,
			TargetURL: targetURL,
			ExpiresAt: time.Now().Add(ttl),
			CreatedBy: creatorID,
			Label:     label,
		}
		if err := h.Shortlinks.Insert(ctx, sl); err == nil {
			return sl, nil
		} else if !isUniqueViolation(err) {
			return nil, err
		}
		// Collision — pick a new code and try again.
	}
	return nil, errors.New("could not generate a unique shortlink code after retries")
}

// isUniqueViolation reports whether the error is a Postgres unique
// constraint violation (SQLSTATE 23505). Done by string match because
// importing the pgconn package just for this check pulls more deps than
// it's worth — the error message is stable across pq/pgx drivers.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "23505") || strings.Contains(s, "duplicate key")
}

// buildShortURL returns the public-facing short URL for a code. Uses
// the apex domain so the link works regardless of which subdomain the
// admin is on when they generate it.
func (h *Handler) buildShortURL(code string) string {
	base := strings.Trim(h.Cfg.TenantBaseDomain, ".")
	if base == "" {
		return "/s/" + code
	}
	return "https://" + base + "/s/" + code
}

// handleResolveShortlink is the GET /s/{code} handler. Public — anyone
// with the link can resolve it. The mounted router skips auth for this
// path (see Routes()).
func (h *Handler) handleResolveShortlink(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		http.NotFound(w, r)
		return
	}
	if h.Shortlinks == nil {
		writeError(w, http.StatusServiceUnavailable, "shortlink store not configured")
		return
	}
	sl, err := h.Shortlinks.Get(r.Context(), code)
	if err != nil {
		if errors.Is(err, store.ErrShortlinkNotFound) {
			renderShortlinkNotFound(w)
			return
		}
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	// Best-effort counter bump. Fire-and-forget so a transient DB issue
	// doesn't block the redirect that the user is waiting on.
	go func(code string) {
		if err := h.Shortlinks.RecordHit(context.Background(), code); err != nil {
			log.Printf("shortlink: hit counter update failed for %s: %v", code, err)
		}
	}(sl.Code)

	// 302 keeps the original URL out of the redirect cache so a
	// rotated magic link doesn't get pinned by browsers. The target
	// URL was admin-issued so we trust it as the destination.
	http.Redirect(w, r, sl.TargetURL, http.StatusFound)
}

// handleListShortlinks lists recent shortlinks for the admin UI.
// Admin-only.
func (h *Handler) handleListShortlinks(w http.ResponseWriter, r *http.Request) {
	if h.Shortlinks == nil {
		writeError(w, http.StatusServiceUnavailable, "shortlink store not configured")
		return
	}
	list, err := h.Shortlinks.List(r.Context(), 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, sl := range list {
		out = append(out, map[string]any{
			"code":        sl.Code,
			"short_url":   h.buildShortURL(sl.Code),
			"target_url":  sl.TargetURL,
			"label":       sl.Label,
			"created_at":  sl.CreatedAt,
			"expires_at":  sl.ExpiresAt,
			"hits":        sl.Hits,
			"last_hit_at": sl.LastHitAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"shortlinks": out})
}

// handleDeleteShortlink revokes a shortlink. Admin-only. Idempotent —
// returns 204 whether the code existed or not (mirrors the store
// Delete semantics, keeps the UI's delete affordance from surfacing
// confusing "already gone" errors on double-click).
func (h *Handler) handleDeleteShortlink(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		writeError(w, http.StatusBadRequest, "code required")
		return
	}
	if h.Shortlinks == nil {
		writeError(w, http.StatusServiceUnavailable, "shortlink store not configured")
		return
	}
	if err := h.Shortlinks.Delete(r.Context(), code); err != nil {
		writeError(w, http.StatusInternalServerError, "db: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// renderShortlinkNotFound serves a small HTML 404 page for /s/{code}
// requests that fail to resolve. Self-contained — same reason as the
// magic-link consumed page (this should work even if the SPA is down).
func renderShortlinkNotFound(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Link expirado</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#1a1a1a}
@media(prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}}</style>
</head><body><h1>Link expirado ou inválido</h1>
<p>Esse link pode ter sido revogado, expirado, ou nunca existiu.</p>
<p>Se você precisa de acesso, peça um link novo para o operador.</p>
</body></html>`))
}

// CreateShortlinkInternal is the helper backend flows (e.g. resend-
// credentials, magic-link generation) call to wrap a long URL into a
// short one. Failure is logged and returned — callers decide whether
// to fall back to the long URL or surface the error.
func (h *Handler) CreateShortlinkInternal(
	ctx context.Context,
	targetURL, label string,
	ttl time.Duration,
) (string, error) {
	if h.Shortlinks == nil {
		return "", errors.New("shortlink store not configured")
	}
	if ttl <= 0 {
		ttl = defaultShortlinkTTL
	}
	if ttl > maxShortlinkTTL {
		ttl = maxShortlinkTTL
	}
	sl, err := h.createShortlinkWithRetry(ctx, targetURL, label, ttl, nil)
	if err != nil {
		return "", err
	}
	return h.buildShortURL(sl.Code), nil
}

// canonicalShortlinkPath normalises a request path so /s/abc, /s/abc/,
// and /s//abc all map to the same code lookup. Defensive — chi already
// strips trailing slashes by default but the resolver is on the apex
// where any number of middleware layers might munge the path first.
func canonicalShortlinkPath(raw string) string {
	clean := path.Clean("/" + strings.TrimPrefix(raw, "/"))
	return clean
}

// canonicalShortlinkPathUnused keeps the helper exported-looking without
// triggering an unused-function warning until a future use case wires
// it in (e.g. fallback path matching).
var _ = canonicalShortlinkPath
