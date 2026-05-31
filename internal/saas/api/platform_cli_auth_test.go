package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

func TestClaudeCLIAuthPutThenGet(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	h := &Handler{Cfg: &config.Config{TenantClaudeCliAuthDir: dir}}
	const token = "sk-ant-oat01-TESTtoken1234567890ABCDEFlongenough"

	// PUT writes the credentials file in the no-refresh format.
	rec := httptest.NewRecorder()
	h.handlePutClaudeCLIAuth(rec, httptest.NewRequest(
		http.MethodPut, "/api/v1/platform/cli-auth/claude",
		strings.NewReader(`{"token":"`+token+`"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT status=%d body=%s", rec.Code, rec.Body.String())
	}

	raw, err := os.ReadFile(filepath.Join(dir, ".credentials.json"))
	if err != nil {
		t.Fatalf("read credentials: %v", err)
	}
	var cred struct {
		ClaudeAiOauth struct {
			AccessToken  string `json:"accessToken"`
			RefreshToken string `json:"refreshToken"`
			ExpiresAt    int64  `json:"expiresAt"`
		} `json:"claudeAiOauth"`
	}
	if err := json.Unmarshal(raw, &cred); err != nil {
		t.Fatalf("parse credentials: %v", err)
	}
	if cred.ClaudeAiOauth.AccessToken != token {
		t.Errorf("accessToken = %q, want %q", cred.ClaudeAiOauth.AccessToken, token)
	}
	if cred.ClaudeAiOauth.RefreshToken != "" {
		t.Errorf("refreshToken = %q, want empty", cred.ClaudeAiOauth.RefreshToken)
	}
	if cred.ClaudeAiOauth.ExpiresAt != claudeCLINoRefreshExpMS {
		t.Errorf("expiresAt = %d, want %d", cred.ClaudeAiOauth.ExpiresAt, claudeCLINoRefreshExpMS)
	}

	// GET reports configured + a masked preview, never the full token.
	recG := httptest.NewRecorder()
	h.handleGetClaudeCLIAuth(recG, httptest.NewRequest(http.MethodGet, "/x", nil))
	if recG.Code != http.StatusOK {
		t.Fatalf("GET status=%d", recG.Code)
	}
	body := recG.Body.String()
	if strings.Contains(body, token) {
		t.Errorf("GET response leaked the full token: %s", body)
	}
	var out claudeCLIAuthOut
	if err := json.Unmarshal(recG.Body.Bytes(), &out); err != nil {
		t.Fatalf("parse GET: %v", err)
	}
	if !out.Configured || !out.DirConfigured || out.TokenPreview == "" {
		t.Errorf("GET out = %+v, want configured+dir_configured+preview", out)
	}
}

func TestClaudeCLIAuthRejectsNonOATToken(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	h := &Handler{Cfg: &config.Config{TenantClaudeCliAuthDir: dir}}
	rec := httptest.NewRecorder()
	h.handlePutClaudeCLIAuth(rec, httptest.NewRequest(
		http.MethodPut, "/x", strings.NewReader(`{"token":"sk-ant-api03-not-a-setup-token"}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for non-oat token (body=%s)", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dir, ".credentials.json")); !os.IsNotExist(err) {
		t.Errorf("credentials file should not be written for a rejected token")
	}
}

func TestClaudeCLIAuthDirNotConfigured(t *testing.T) {
	h := &Handler{Cfg: &config.Config{}}
	rec := httptest.NewRecorder()
	h.handleGetClaudeCLIAuth(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET status=%d", rec.Code)
	}
	var out claudeCLIAuthOut
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out.DirConfigured || out.Configured {
		t.Errorf("out = %+v, want dir_configured=false configured=false", out)
	}
}
