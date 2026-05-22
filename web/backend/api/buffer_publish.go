package api

// POST /api/marketing/buffer-publish
//
// Schedules an Instagram post via the Buffer API on behalf of the tenant.
// The handler acts as a thin, authenticated proxy so that the Buffer access
// token never leaves the server.
//
// Requires env vars:
//
//	BUFFER_ACCESS_TOKEN          – Buffer OAuth access token
//	BUFFER_INSTAGRAM_PROFILE_ID  – Buffer profile ID for the connected Instagram
//	                               Business account
//
// Request body (JSON):
//
//	{
//	  "image_url":     "https://…",               // required — HTTPS URL accessible by Buffer
//	  "caption":       "…",                        // required — max 2200 chars incl. hashtags
//	  "first_comment": "…",                        // optional — first comment (Buffer Pro)
//	  "campaign_id":   "…",                        // optional — logged only
//	  "approved_by":   "…",                        // optional — logged only
//	  "schedule_at":   "2026-06-12T10:00:00-03:00" // optional ISO 8601; absent = now
//	}
//
// Success response (200):
//
//	{"ok":true,"buffer_update_id":"…","status":"…","due_at":"…","share_url":"…"}
//
// Error response:
//
//	{"ok":false,"error":"…","buffer_error":"…"}
//
// Buffer API reference:
//
//	POST https://api.bufferapp.com/1/updates/create.json  (form-encoded)

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

const (
	bufferCreateURL   = "https://api.bufferapp.com/1/updates/create.json"
	bufferHTTPTimeout = 15 * time.Second
	bufferMaxCaption  = 2200
)

// bufferPublishRequest is the JSON body accepted by POST /api/marketing/buffer-publish.
type bufferPublishRequest struct {
	ImageURL     string `json:"image_url"`
	Caption      string `json:"caption"`
	FirstComment string `json:"first_comment"` // optional — Buffer Pro only
	CampaignID   string `json:"campaign_id"`   // optional — logged only
	ApprovedBy   string `json:"approved_by"`   // optional — logged only
	ScheduleAt   string `json:"schedule_at"`   // optional ISO 8601
}

// bufferAPIResponse is the subset of the Buffer create-update response we
// care about. Buffer returns a richer object; we map only what we expose.
type bufferAPIResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	DueAt  string `json:"due_at"`
	// Buffer wraps the share URL inside a nested object; we surface it from
	// the raw payload via a custom unmarshal approach (see parseBufferResponse).
}

func (h *Handler) registerBufferPublishRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/marketing/buffer-publish", h.handleBufferPublish)
}

// handleBufferPublish implements POST /api/marketing/buffer-publish.
func (h *Handler) handleBufferPublish(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// ── 1. Read credentials from environment ─────────────────────────────────
	token := strings.TrimSpace(os.Getenv(config.EnvBufferAccessToken))
	profileID := strings.TrimSpace(os.Getenv(config.EnvBufferInstagramProfileID))
	if token == "" || profileID == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "Buffer not configured. Set BUFFER_ACCESS_TOKEN and BUFFER_INSTAGRAM_PROFILE_ID.",
		})
		return
	}

	// ── 2. Decode and validate request body ───────────────────────────────────
	var req bufferPublishRequest
	dec := json.NewDecoder(io.LimitReader(r.Body, 64*1024))
	if err := dec.Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": fmt.Sprintf("invalid JSON body: %v", err),
		})
		return
	}

	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.Caption = strings.TrimSpace(req.Caption)

	if req.ImageURL == "" || req.Caption == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "image_url and caption are required",
		})
		return
	}

	if !strings.HasPrefix(req.ImageURL, "https://") {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "image_url must start with https:// — Buffer does not accept plain HTTP URLs",
		})
		return
	}

	// Truncate caption if it exceeds Buffer's 2 200-character limit.
	if len([]rune(req.Caption)) > bufferMaxCaption {
		runes := []rune(req.Caption)
		req.Caption = string(runes[:bufferMaxCaption])
	}

	// ── 3. Build form-encoded payload for Buffer ──────────────────────────────
	form := url.Values{}
	form.Set("access_token", token)
	form.Set("profile_ids[]", profileID)
	form.Set("text", req.Caption)
	form.Set("media[photo]", req.ImageURL)
	if s := strings.TrimSpace(req.ScheduleAt); s != "" {
		form.Set("scheduled_at", s)
	}

	// ── 4. POST to Buffer API ─────────────────────────────────────────────────
	client := &http.Client{Timeout: bufferHTTPTimeout}
	bufReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, bufferCreateURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": fmt.Sprintf("failed to build Buffer request: %v", err),
		})
		return
	}
	bufReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(bufReq)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": fmt.Sprintf("Buffer API unreachable: %v", err),
		})
		return
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "failed to read Buffer API response",
		})
		return
	}

	// ── 5. Parse Buffer response ──────────────────────────────────────────────
	updateID, status, dueAt, shareURL, bufErr := parseBufferResponse(rawBody, resp.StatusCode)

	if bufErr != "" || resp.StatusCode >= 400 {
		httpStatus := http.StatusBadGateway
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			httpStatus = http.StatusUnauthorized
		}
		w.WriteHeader(httpStatus)
		json.NewEncoder(w).Encode(map[string]any{
			"ok":           false,
			"error":        "Buffer API returned an error",
			"buffer_error": bufErr,
		})
		return
	}

	// ── 6. Log audit trail (no token) ─────────────────────────────────────────
	log.Printf("[buffer-publish] ok buffer_update_id=%s campaign_id=%q approved_by=%q",
		updateID,
		strings.TrimSpace(req.CampaignID),
		strings.TrimSpace(req.ApprovedBy),
	)

	// ── 7. Return success to caller ───────────────────────────────────────────
	json.NewEncoder(w).Encode(map[string]any{
		"ok":               true,
		"buffer_update_id": updateID,
		"status":           status,
		"due_at":           dueAt,
		"share_url":        shareURL,
	})
}

// parseBufferResponse extracts the fields we expose from the Buffer API JSON
// payload. It also surfaces the error message when Buffer returns a failure.
//
// Buffer success payload example:
//
//	{"id":"…","status":"pending","due_at":"2026-06-12T10:00:00+00:00",
//	 "profile_id":"…","media":{"picture":"…"},"text":"…"}
//
// Buffer error payload example:
//
//	{"code":1000,"error":"Invalid access token"}
func parseBufferResponse(body []byte, httpStatus int) (updateID, status, dueAt, shareURL, bufErr string) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		bufErr = fmt.Sprintf("unparseable response from Buffer (HTTP %d)", httpStatus)
		return updateID, status, dueAt, shareURL, bufErr
	}

	// Error field — present on failure.
	if errRaw, ok := raw["error"]; ok {
		_ = json.Unmarshal(errRaw, &bufErr)
	}

	// Success fields.
	if idRaw, ok := raw["id"]; ok {
		_ = json.Unmarshal(idRaw, &updateID)
	}
	if stRaw, ok := raw["status"]; ok {
		_ = json.Unmarshal(stRaw, &status)
	}
	if dueRaw, ok := raw["due_at"]; ok {
		_ = json.Unmarshal(dueRaw, &dueAt)
	}

	// Buffer may surface the share URL inside media[picture] or a top-level
	// share_url; surface whichever is present.
	if suRaw, ok := raw["share_url"]; ok {
		_ = json.Unmarshal(suRaw, &shareURL)
	}
	if shareURL == "" {
		if mediaRaw, ok := raw["media"]; ok {
			var media map[string]json.RawMessage
			if json.Unmarshal(mediaRaw, &media) == nil {
				if picRaw, ok := media["picture"]; ok {
					_ = json.Unmarshal(picRaw, &shareURL)
				}
			}
		}
	}

	return updateID, status, dueAt, shareURL, bufErr
}
