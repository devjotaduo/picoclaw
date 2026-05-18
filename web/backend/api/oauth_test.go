package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/auth"
	"github.com/sipeed/picoclaw/pkg/config"
)

func TestOAuthLoginRejectsUnsupportedMethod(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/oauth/login",
		strings.NewReader(`{"provider":"anthropic","method":"device_code"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestOAuthAnthropicBrowserFlowIsManualPaste(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	oauthGeneratePKCE = func() (auth.PKCECodes, error) {
		return auth.PKCECodes{CodeVerifier: "verifier-a", CodeChallenge: "challenge-a"}, nil
	}
	oauthGenerateState = func() (string, error) { return "state-a", nil }
	oauthBuildAuthorizeURL = func(cfg auth.OAuthProviderConfig, pkce auth.PKCECodes, state, redirectURI string) string {
		if redirectURI != auth.AnthropicPasteRedirectURI {
			t.Fatalf("redirect_uri = %q, want %q", redirectURI, auth.AnthropicPasteRedirectURI)
		}
		return "https://claude.ai/oauth/authorize?state=" + state
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/oauth/login",
		strings.NewReader(`{"provider":"anthropic","method":"browser"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var loginResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got, _ := loginResp["manual_paste"].(bool); !got {
		t.Fatalf("manual_paste = %v, want true (resp=%v)", loginResp["manual_paste"], loginResp)
	}
	if got, _ := loginResp["redirect_uri"].(string); got != auth.AnthropicPasteRedirectURI {
		t.Fatalf("redirect_uri = %q, want %q", got, auth.AnthropicPasteRedirectURI)
	}
}

func TestOAuthSubmitAnthropicPasteExchangesAndPersists(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	oauthExchangeCodeForTokensWithState = func(
		cfg auth.OAuthProviderConfig, code, codeVerifier, state, redirectURI string,
	) (*auth.AuthCredential, error) {
		if code != "abc123" {
			t.Fatalf("code = %q, want abc123", code)
		}
		if state != "state-a" {
			t.Fatalf("state = %q, want state-a (must be forwarded to anthropic /v1/oauth/token)", state)
		}
		if redirectURI != auth.AnthropicPasteRedirectURI {
			t.Fatalf("redirect_uri = %q, want anthropic paste URI", redirectURI)
		}
		return &auth.AuthCredential{
			AccessToken:  "sk-ant-oat01-test",
			RefreshToken: "sk-ant-ort01-test",
			Provider:     oauthProviderAnthropic,
			AuthMethod:   "oauth",
		}, nil
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	now := time.Now()
	h.storeOAuthFlow(&oauthFlow{
		ID:           "anth-flow",
		Provider:     oauthProviderAnthropic,
		Method:       oauthMethodBrowser,
		Status:       oauthFlowPending,
		CreatedAt:    now,
		UpdatedAt:    now,
		ExpiresAt:    now.Add(10 * time.Minute),
		CodeVerifier: "verifier-a",
		OAuthState:   "state-a",
		RedirectURI:  auth.AnthropicPasteRedirectURI,
		ManualPaste:  true,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/oauth/flows/anth-flow/submit",
		strings.NewReader(`{"paste":"abc123#state-a"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var flowResp oauthFlowResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &flowResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if flowResp.Status != oauthFlowSuccess {
		t.Fatalf("flow status = %q, want %q", flowResp.Status, oauthFlowSuccess)
	}

	cred, err := auth.GetCredential(oauthProviderAnthropic)
	if err != nil {
		t.Fatalf("GetCredential: %v", err)
	}
	if cred == nil || cred.AccessToken != "sk-ant-oat01-test" {
		t.Fatalf("credential = %+v, want access token persisted", cred)
	}
}

func TestOAuthBrowserFlowCreatedAndQueried(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	oauthGeneratePKCE = func() (auth.PKCECodes, error) {
		return auth.PKCECodes{CodeVerifier: "verifier-1", CodeChallenge: "challenge-1"}, nil
	}
	oauthGenerateState = func() (string, error) { return "state-1", nil }
	oauthBuildAuthorizeURL = func(cfg auth.OAuthProviderConfig, pkce auth.PKCECodes, state, redirectURI string) string {
		return "https://example.com/authorize?state=" + state
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/oauth/login",
		strings.NewReader(`{"provider":"openai","method":"browser"}`),
	)
	req.Host = "localhost:18800"
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var loginResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("unmarshal login response: %v", err)
	}
	flowID, _ := loginResp["flow_id"].(string)
	if flowID == "" {
		t.Fatalf("flow_id is empty: %v", loginResp)
	}
	if loginResp["auth_url"] != "https://example.com/authorize?state=state-1" {
		t.Fatalf("unexpected auth_url: %v", loginResp["auth_url"])
	}

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/api/oauth/flows/"+flowID, nil)
	mux.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("flow status code = %d, want %d, body=%s", rec2.Code, http.StatusOK, rec2.Body.String())
	}
	var flowResp oauthFlowResponse
	if err := json.Unmarshal(rec2.Body.Bytes(), &flowResp); err != nil {
		t.Fatalf("unmarshal flow response: %v", err)
	}
	if flowResp.Status != oauthFlowPending {
		t.Fatalf("flow status = %q, want %q", flowResp.Status, oauthFlowPending)
	}
	if flowResp.Method != oauthMethodBrowser {
		t.Fatalf("flow method = %q, want %q", flowResp.Method, oauthMethodBrowser)
	}
}

func TestOAuthFlowExpiresWhenQueried(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	now := time.Date(2026, 3, 6, 12, 0, 0, 0, time.UTC)
	oauthNow = func() time.Time { return now }

	h := NewHandler(configPath)
	h.storeOAuthFlow(&oauthFlow{
		ID:        "expired-flow",
		Provider:  oauthProviderOpenAI,
		Method:    oauthMethodBrowser,
		Status:    oauthFlowPending,
		CreatedAt: now.Add(-20 * time.Minute),
		UpdatedAt: now.Add(-20 * time.Minute),
		ExpiresAt: now.Add(-1 * time.Minute),
	})

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/oauth/flows/expired-flow", nil)
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var flowResp oauthFlowResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &flowResp); err != nil {
		t.Fatalf("unmarshal flow response: %v", err)
	}
	if flowResp.Status != oauthFlowExpired {
		t.Fatalf("flow status = %q, want %q", flowResp.Status, oauthFlowExpired)
	}
}

func TestOAuthCallbackUnknownState(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/oauth/callback?state=unknown&code=abc", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
	if !strings.Contains(rec.Body.String(), "OAuth flow not found") {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}

func TestOAuthLogoutClearsCredentialAndConfig(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	cfg.ModelList = append(cfg.ModelList, &config.ModelConfig{
		ModelName:  "gpt-5.4",
		Model:      "openai/gpt-5.4",
		AuthMethod: "oauth",
	})
	if err = config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig error: %v", err)
	}
	if err = auth.SetCredential(oauthProviderOpenAI, &auth.AuthCredential{
		AccessToken: "token-before-logout",
		Provider:    oauthProviderOpenAI,
		AuthMethod:  "oauth",
	}); err != nil {
		t.Fatalf("SetCredential error: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/oauth/logout", bytes.NewBufferString(`{"provider":"openai"}`))
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	cred, err := auth.GetCredential(oauthProviderOpenAI)
	if err != nil {
		t.Fatalf("GetCredential error: %v", err)
	}
	if cred != nil {
		t.Fatalf("expected credential deleted, got %#v", cred)
	}

	updated, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	for _, m := range updated.ModelList {
		if strings.HasPrefix(m.Model, "openai/") && m.AuthMethod != "" {
			t.Fatalf("openai model auth_method = %q, want empty", m.AuthMethod)
		}
	}
}

func TestOAuthLogoutClearsAuthMethodForExplicitProviderField(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	cfg.ModelList = append(cfg.ModelList, &config.ModelConfig{
		ModelName:  "gpt-5.4",
		Provider:   "openai",
		Model:      "gpt-5.4",
		AuthMethod: "oauth",
	})
	if err = config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig error: %v", err)
	}
	if err = auth.SetCredential(oauthProviderOpenAI, &auth.AuthCredential{
		AccessToken: "token-before-logout",
		Provider:    oauthProviderOpenAI,
		AuthMethod:  "oauth",
	}); err != nil {
		t.Fatalf("SetCredential error: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/oauth/logout", bytes.NewBufferString(`{"provider":"openai"}`))
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	updated, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	if got := updated.ModelList[len(updated.ModelList)-1].AuthMethod; got != "" {
		t.Fatalf("auth_method = %q, want empty", got)
	}
}

func TestGitHubCopilotLoginCreatesNativeCopilotModel(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	h := NewHandler(configPath)
	if err := h.persistCredentialAndConfig(oauthProviderGitHubCopilot, oauthMethodGHCLI, &auth.AuthCredential{
		AccessToken: "gho-test",
		AuthMethod:  oauthMethodGHCLI,
	}); err != nil {
		t.Fatalf("persistCredentialAndConfig error: %v", err)
	}

	updated, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	var got *config.ModelConfig
	for _, m := range updated.ModelList {
		if m.ModelName == "copilot-gpt-4.1" {
			got = m
			break
		}
	}
	if got == nil {
		t.Fatalf("copilot model was not created")
	}
	if got.Provider != "github-copilot" {
		t.Fatalf("provider = %q, want github-copilot", got.Provider)
	}
	if got.Model != "gpt-4.1" {
		t.Fatalf("model = %q, want gpt-4.1", got.Model)
	}
	if got.APIBase != "" {
		t.Fatalf("api_base = %q, want empty", got.APIBase)
	}
	if got.ConnectMode != "grpc" {
		t.Fatalf("connect_mode = %q, want grpc", got.ConnectMode)
	}
	if got.AuthMethod != oauthMethodGHCLI {
		t.Fatalf("auth_method = %q, want %q", got.AuthMethod, oauthMethodGHCLI)
	}
	if got.APIKey() != "" {
		t.Fatalf("api key should not be written into github-copilot model config")
	}
}

func TestGitHubCopilotLoginMigratesLegacyGitHubModelsConfig(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()
	resetOAuthHooks(t)

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	cfg.ModelList = append(cfg.ModelList, &config.ModelConfig{
		ModelName:  "github-gpt-4o",
		Provider:   "github-models",
		Model:      "gpt-4o",
		APIBase:    "https://models.inference.ai.azure.com",
		AuthMethod: "token",
		APIKeys:    config.SimpleSecureStrings("legacy-token"),
	})
	if err = config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig error: %v", err)
	}

	h := NewHandler(configPath)
	if err = h.persistCredentialAndConfig(oauthProviderGitHubCopilot, oauthMethodGHCLI, &auth.AuthCredential{
		AccessToken: "gho-test",
		AuthMethod:  oauthMethodGHCLI,
	}); err != nil {
		t.Fatalf("persistCredentialAndConfig error: %v", err)
	}

	updated, err := config.LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	var got *config.ModelConfig
	for _, m := range updated.ModelList {
		if m.ModelName == "github-gpt-4o" {
			got = m
			break
		}
	}
	if got == nil {
		t.Fatalf("legacy github model missing after migration")
	}
	if got.Provider != "github-copilot" {
		t.Fatalf("provider = %q, want github-copilot", got.Provider)
	}
	if got.Model != "gpt-4.1" {
		t.Fatalf("model = %q, want gpt-4.1", got.Model)
	}
	if got.APIBase != "" {
		t.Fatalf("api_base = %q, want empty", got.APIBase)
	}
	if got.ConnectMode != "grpc" {
		t.Fatalf("connect_mode = %q, want grpc", got.ConnectMode)
	}
	if got.AuthMethod != oauthMethodGHCLI {
		t.Fatalf("auth_method = %q, want %q", got.AuthMethod, oauthMethodGHCLI)
	}
	if got.APIKey() != "" {
		t.Fatalf("legacy github-models API key should be removed after migration")
	}
}

func setupOAuthTestEnv(t *testing.T) (string, func()) {
	t.Helper()

	tmp := t.TempDir()
	oldHome := os.Getenv("HOME")
	oldPicoHome := os.Getenv("PICOCLAW_HOME")

	if err := os.Setenv("HOME", tmp); err != nil {
		t.Fatalf("set HOME: %v", err)
	}
	if err := os.Setenv("PICOCLAW_HOME", filepath.Join(tmp, ".picoclaw")); err != nil {
		t.Fatalf("set PICOCLAW_HOME: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.ModelList = []*config.ModelConfig{{
		ModelName: "custom-default",
		Model:     "openai/gpt-4o",
		APIKeys:   config.SimpleSecureStrings("sk-default"),
	}}
	cfg.Agents.Defaults.ModelName = "custom-default"

	configPath := filepath.Join(tmp, "config.json")
	if err := config.SaveConfig(configPath, cfg); err != nil {
		t.Fatalf("SaveConfig error: %v", err)
	}

	cleanup := func() {
		_ = os.Setenv("HOME", oldHome)
		if oldPicoHome == "" {
			_ = os.Unsetenv("PICOCLAW_HOME")
		} else {
			_ = os.Setenv("PICOCLAW_HOME", oldPicoHome)
		}
	}
	return configPath, cleanup
}

func resetOAuthHooks(t *testing.T) {
	t.Helper()

	origNow := oauthNow
	origGeneratePKCE := oauthGeneratePKCE
	origGenerateState := oauthGenerateState
	origBuildAuthorizeURL := oauthBuildAuthorizeURL
	origRequestDeviceCode := oauthRequestDeviceCode
	origPollDeviceCodeOnce := oauthPollDeviceCodeOnce
	origExchangeCodeForTokens := oauthExchangeCodeForTokens
	origExchangeCodeForTokensWithState := oauthExchangeCodeForTokensWithState
	origGetCredential := oauthGetCredential
	origSetCredential := oauthSetCredential
	origDeleteCredential := oauthDeleteCredential
	origLoadConfig := oauthLoadConfig
	origSaveConfig := oauthSaveConfig
	origFetchProject := oauthFetchAntigravityProject
	origFetchGoogleEmail := oauthFetchGoogleUserEmailFunc

	t.Cleanup(func() {
		oauthNow = origNow
		oauthGeneratePKCE = origGeneratePKCE
		oauthGenerateState = origGenerateState
		oauthBuildAuthorizeURL = origBuildAuthorizeURL
		oauthRequestDeviceCode = origRequestDeviceCode
		oauthPollDeviceCodeOnce = origPollDeviceCodeOnce
		oauthExchangeCodeForTokens = origExchangeCodeForTokens
		oauthExchangeCodeForTokensWithState = origExchangeCodeForTokensWithState
		oauthGetCredential = origGetCredential
		oauthSetCredential = origSetCredential
		oauthDeleteCredential = origDeleteCredential
		oauthLoadConfig = origLoadConfig
		oauthSaveConfig = origSaveConfig
		oauthFetchAntigravityProject = origFetchProject
		oauthFetchGoogleUserEmailFunc = origFetchGoogleEmail
	})
}
