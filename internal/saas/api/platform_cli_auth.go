package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Shared CLI auth (claude-cli): the operator's long-lived Claude OAuth token
// (from `claude setup-token`) is delivered to every claude-cli tenant via a
// read-only bind mount of TenantClaudeCliAuthDir/.credentials.json. This
// endpoint lets a platform_admin rotate that single shared token from the
// admin UI instead of editing the host file over SSH.
//
// The token is written as the `accessToken` of a synthetic claudeAiOauth
// credential with a far-future expiresAt and empty refreshToken, so the claude
// CLI never attempts a refresh and always sends the long-lived token as the
// bearer. Writing requires the controlplane to mount TenantClaudeCliAuthDir
// read-write (it is read-only by default; see docs).
const (
	claudeCLITokenPrefix = "sk-ant-oat"
	// Sentinel expiresAt (~2030, in ms) so the claude CLI treats the token as
	// valid and never tries to refresh — the long-lived token IS the bearer.
	claudeCLINoRefreshExpMS = int64(1900000000000)
)

type claudeCLIAuthOut struct {
	// DirConfigured reports whether PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR is set.
	DirConfigured bool `json:"dir_configured"`
	// Configured reports whether a credentials file currently exists.
	Configured   bool   `json:"configured"`
	TokenPreview string `json:"token_preview,omitempty"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

type claudeCLIAuthReq struct {
	Token string `json:"token"`
}

func (h *Handler) claudeCLIAuthCredentialsPath() string {
	if h.Cfg == nil {
		return ""
	}
	dir := strings.TrimSpace(h.Cfg.TenantClaudeCliAuthDir)
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, ".credentials.json")
}

func (h *Handler) handleGetClaudeCLIAuth(w http.ResponseWriter, r *http.Request) {
	path := h.claudeCLIAuthCredentialsPath()
	out := claudeCLIAuthOut{DirConfigured: path != ""}
	if path == "" {
		writeJSON(w, http.StatusOK, out)
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		// Missing file → simply "not configured", not an error.
		writeJSON(w, http.StatusOK, out)
		return
	}
	out.Configured = true
	out.UpdatedAt = info.ModTime().UTC().Format(time.RFC3339)
	if tok := readClaudeCLIAccessToken(path); tok != "" {
		out.TokenPreview = maskCLIToken(tok)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handlePutClaudeCLIAuth(w http.ResponseWriter, r *http.Request) {
	path := h.claudeCLIAuthCredentialsPath()
	if path == "" {
		writeError(w, http.StatusServiceUnavailable,
			"claude-cli auth dir not configured (PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR)")
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	var req claudeCLIAuthReq
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	// setup-token output is a single line; tolerate whitespace/newlines from paste.
	token := strings.Join(strings.Fields(req.Token), "")
	if !strings.HasPrefix(token, claudeCLITokenPrefix) {
		writeError(w, http.StatusBadRequest,
			"token must be a Claude long-lived OAuth token (starts with sk-ant-oat…), generated via `claude setup-token`")
		return
	}

	cred := map[string]any{
		"claudeAiOauth": map[string]any{
			"accessToken":      token,
			"refreshToken":     "",
			"expiresAt":        claudeCLINoRefreshExpMS,
			"scopes":           []string{"user:inference", "user:profile"},
			"subscriptionType": "max",
		},
	}
	data, err := json.MarshalIndent(cred, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "encode error")
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		log.Printf("ERROR platform_cli_auth: mkdir %s: %v", filepath.Dir(path), err)
		writeError(w, http.StatusInternalServerError, "write error")
		return
	}
	// Atomic replace: write to a sibling temp then rename (same filesystem as
	// the bind mount, so rename is atomic).
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		log.Printf("ERROR platform_cli_auth: write %s: %v", tmp, err)
		writeError(w, http.StatusInternalServerError,
			"write failed — is PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR mounted read-write into the controlplane?")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		log.Printf("ERROR platform_cli_auth: rename %s: %v", path, err)
		writeError(w, http.StatusInternalServerError, "write error")
		return
	}
	_ = os.Chmod(path, 0o600)
	log.Printf("platform_cli_auth: claude-cli shared token rotated (%s)", maskCLIToken(token))

	out := claudeCLIAuthOut{DirConfigured: true, Configured: true, TokenPreview: maskCLIToken(token)}
	if info, statErr := os.Stat(path); statErr == nil {
		out.UpdatedAt = info.ModTime().UTC().Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, out)
}

// readClaudeCLIAccessToken extracts the accessToken from a credentials file,
// tolerating both the nested {claudeAiOauth:{…}} and flat shapes.
func readClaudeCLIAccessToken(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var parsed struct {
		ClaudeAiOauth struct {
			AccessToken string `json:"accessToken"`
		} `json:"claudeAiOauth"`
		AccessToken string `json:"accessToken"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return ""
	}
	if parsed.ClaudeAiOauth.AccessToken != "" {
		return parsed.ClaudeAiOauth.AccessToken
	}
	return parsed.AccessToken
}

// maskCLIToken keeps a recognizable head + last 4 chars so the operator can
// confirm which token is set without exposing it.
func maskCLIToken(tok string) string {
	tok = strings.TrimSpace(tok)
	if len(tok) <= 18 {
		return "…"
	}
	return tok[:16] + "…" + tok[len(tok)-4:]
}
