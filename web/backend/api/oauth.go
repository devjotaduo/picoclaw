package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/auth"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
	"gopkg.in/yaml.v3"
)

const (
	oauthProviderOpenAI            = "openai"
	oauthProviderAnthropic         = "anthropic"
	oauthProviderGoogleAntigravity = "google-antigravity"
	oauthProviderGitHubCopilot     = "github-copilot"

	oauthMethodBrowser    = "browser"
	oauthMethodDeviceCode = "device_code"
	oauthMethodToken      = "token"
	oauthMethodClaudeCode = "claude_code"
	oauthMethodGHCLI      = "gh_cli"

	oauthFlowPending = "pending"
	oauthFlowSuccess = "success"
	oauthFlowError   = "error"
	oauthFlowExpired = "expired"
)

const (
	oauthBrowserFlowTTL    = 10 * time.Minute
	oauthDeviceCodeFlowTTL = 15 * time.Minute
	oauthTerminalFlowGC    = 30 * time.Minute
	oauthGHCLIImportTTL    = 5 * time.Second
)

var oauthProviderOrder = []string{
	oauthProviderOpenAI,
	oauthProviderAnthropic,
	oauthProviderGoogleAntigravity,
	oauthProviderGitHubCopilot,
}

var oauthProviderMethods = map[string][]string{
	oauthProviderOpenAI:            {oauthMethodBrowser, oauthMethodDeviceCode, oauthMethodToken},
	oauthProviderAnthropic:         {oauthMethodBrowser, oauthMethodToken, oauthMethodClaudeCode},
	oauthProviderGoogleAntigravity: {oauthMethodBrowser},
	oauthProviderGitHubCopilot:     {oauthMethodGHCLI, oauthMethodToken},
}

var oauthProviderLabels = map[string]string{
	oauthProviderOpenAI:            "OpenAI",
	oauthProviderAnthropic:         "Anthropic",
	oauthProviderGoogleAntigravity: "Google Antigravity",
	oauthProviderGitHubCopilot:     "GitHub Copilot",
}

var (
	oauthNow                            = time.Now
	oauthGeneratePKCE                   = auth.GeneratePKCE
	oauthGenerateState                  = auth.GenerateState
	oauthBuildAuthorizeURL              = auth.BuildAuthorizeURL
	oauthRequestDeviceCode              = auth.RequestDeviceCode
	oauthPollDeviceCodeOnce             = auth.PollDeviceCodeOnce
	oauthExchangeCodeForTokens          = auth.ExchangeCodeForTokens
	oauthExchangeCodeForTokensWithState = auth.ExchangeCodeForTokensWithState
	oauthRefreshAccessToken             = auth.RefreshAccessToken
	oauthGetCredential                  = auth.GetCredential
	oauthSetCredential                  = auth.SetCredential
	oauthDeleteCredential               = auth.DeleteCredential
	oauthLoadConfig                     = config.LoadConfig
	oauthSaveConfig                     = config.SaveConfig
	oauthFetchAntigravityProject        = providers.FetchAntigravityProjectID
	oauthFetchGoogleUserEmailFunc       = fetchGoogleUserEmail
	oauthRunGHCLI                       = runGHCLI
)

type oauthFlow struct {
	ID           string
	Provider     string
	Method       string
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	ExpiresAt    time.Time
	Error        string
	CodeVerifier string
	OAuthState   string
	RedirectURI  string
	DeviceAuthID string
	UserCode     string
	VerifyURL    string
	Interval     int
	// ManualPaste indicates the flow does not have an HTTP callback and the
	// authorization code must be POSTed to /api/oauth/flows/{id}/submit.
	ManualPaste bool
}

type oauthProviderStatus struct {
	Provider    string   `json:"provider"`
	DisplayName string   `json:"display_name"`
	Methods     []string `json:"methods"`
	LoggedIn    bool     `json:"logged_in"`
	Status      string   `json:"status"`
	AuthMethod  string   `json:"auth_method,omitempty"`
	ExpiresAt   string   `json:"expires_at,omitempty"`
	AccountID   string   `json:"account_id,omitempty"`
	Email       string   `json:"email,omitempty"`
	ProjectID   string   `json:"project_id,omitempty"`
}

type oauthFlowResponse struct {
	FlowID      string `json:"flow_id"`
	Provider    string `json:"provider"`
	Method      string `json:"method"`
	Status      string `json:"status"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	Error       string `json:"error,omitempty"`
	UserCode    string `json:"user_code,omitempty"`
	VerifyURL   string `json:"verify_url,omitempty"`
	Interval    int    `json:"interval,omitempty"`
	ManualPaste bool   `json:"manual_paste,omitempty"`
}

// registerOAuthRoutes binds OAuth login/logout endpoints to the ServeMux.
func (h *Handler) registerOAuthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/oauth/providers", h.handleListOAuthProviders)
	mux.HandleFunc("POST /api/oauth/login", h.handleOAuthLogin)
	mux.HandleFunc("GET /api/oauth/flows/{id}", h.handleGetOAuthFlow)
	mux.HandleFunc("POST /api/oauth/flows/{id}/poll", h.handlePollOAuthFlow)
	mux.HandleFunc("POST /api/oauth/flows/{id}/submit", h.handleSubmitOAuthFlow)
	mux.HandleFunc("POST /api/oauth/logout", h.handleOAuthLogout)
	mux.HandleFunc("GET /oauth/callback", h.handleOAuthCallback)
}

func (h *Handler) handleListOAuthProviders(w http.ResponseWriter, r *http.Request) {
	providersResp := make([]oauthProviderStatus, 0, len(oauthProviderOrder))

	for _, provider := range oauthProviderOrder {
		cred, err := oauthGetCredential(provider)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to load credentials: %v", err), http.StatusInternalServerError)
			return
		}
		cred = h.refreshOAuthCredentialForStatus(provider, cred)

		item := oauthProviderStatus{
			Provider:    provider,
			DisplayName: oauthProviderLabels[provider],
			Methods:     oauthProviderMethods[provider],
			Status:      "not_logged_in",
		}
		if cred != nil {
			item.LoggedIn = true
			item.AuthMethod = cred.AuthMethod
			item.AccountID = cred.AccountID
			item.Email = cred.Email
			item.ProjectID = cred.ProjectID
			if !cred.ExpiresAt.IsZero() {
				item.ExpiresAt = cred.ExpiresAt.Format(time.RFC3339)
			}
			switch {
			case cred.IsExpired():
				item.Status = "expired"
			case cred.NeedsRefresh():
				item.Status = "needs_refresh"
			default:
				item.Status = "connected"
			}
		}

		providersResp = append(providersResp, item)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"providers": providersResp,
	})
}

func (h *Handler) refreshOAuthCredentialForStatus(provider string, cred *auth.AuthCredential) *auth.AuthCredential {
	if cred == nil || !cred.NeedsRefresh() || strings.TrimSpace(cred.RefreshToken) == "" {
		return cred
	}

	cfg, err := oauthConfigForProvider(provider)
	if err != nil {
		return cred
	}

	refreshed, err := oauthRefreshAccessToken(cred, cfg)
	if err != nil {
		logger.ErrorC("oauth", fmt.Sprintf("oauth warning: could not refresh %s credentials: %v", provider, err))
		return cred
	}
	if refreshed == nil {
		return cred
	}

	cp := *refreshed
	cp.Provider = provider
	if cp.AuthMethod == "" {
		cp.AuthMethod = cred.AuthMethod
	}
	if cp.AuthMethod == "" {
		cp.AuthMethod = "oauth"
	}
	if cp.RefreshToken == "" {
		cp.RefreshToken = cred.RefreshToken
	}
	if cp.AccountID == "" {
		cp.AccountID = cred.AccountID
	}
	if cp.Email == "" {
		cp.Email = cred.Email
	}
	if cp.ProjectID == "" {
		cp.ProjectID = cred.ProjectID
	}

	if err := oauthSetCredential(provider, &cp); err != nil {
		logger.ErrorC("oauth", fmt.Sprintf("oauth warning: could not save refreshed %s credentials: %v", provider, err))
		return cred
	}
	return &cp
}

func (h *Handler) handleOAuthLogin(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req struct {
		Provider string `json:"provider"`
		Method   string `json:"method"`
		Token    string `json:"token"`
	}
	if err = json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	provider, err := normalizeOAuthProvider(req.Provider)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	method := strings.ToLower(strings.TrimSpace(req.Method))
	if !isOAuthMethodSupported(provider, method) {
		http.Error(
			w,
			fmt.Sprintf("unsupported login method %q for provider %q", method, provider),
			http.StatusBadRequest,
		)
		return
	}

	switch method {
	case oauthMethodToken:
		token := strings.TrimSpace(req.Token)
		if token == "" {
			http.Error(w, "token is required", http.StatusBadRequest)
			return
		}

		cred := &auth.AuthCredential{
			AccessToken: token,
			Provider:    provider,
			AuthMethod:  oauthMethodToken,
		}
		if err := h.persistCredentialAndConfig(provider, oauthMethodToken, cred); err != nil {
			http.Error(w, fmt.Sprintf("token login failed: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "ok",
			"provider": provider,
			"method":   method,
		})
		return

	case oauthMethodDeviceCode:
		cfg := auth.OpenAIOAuthConfig()
		info, err := oauthRequestDeviceCode(cfg)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to request device code: %v", err), http.StatusInternalServerError)
			return
		}

		now := oauthNow()
		flow := &oauthFlow{
			ID:           newOAuthFlowID(),
			Provider:     provider,
			Method:       method,
			Status:       oauthFlowPending,
			CreatedAt:    now,
			UpdatedAt:    now,
			ExpiresAt:    now.Add(oauthDeviceCodeFlowTTL),
			DeviceAuthID: info.DeviceAuthID,
			UserCode:     info.UserCode,
			VerifyURL:    info.VerifyURL,
			Interval:     info.Interval,
		}
		h.storeOAuthFlow(flow)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":     "ok",
			"provider":   provider,
			"method":     method,
			"flow_id":    flow.ID,
			"user_code":  flow.UserCode,
			"verify_url": flow.VerifyURL,
			"interval":   flow.Interval,
			"expires_at": flow.ExpiresAt.Format(time.RFC3339),
		})
		return

	case oauthMethodBrowser:
		cfg, err := oauthConfigForProvider(provider)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		pkce, err := oauthGeneratePKCE()
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to generate PKCE: %v", err), http.StatusInternalServerError)
			return
		}
		state, err := oauthGenerateState()
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to generate state: %v", err), http.StatusInternalServerError)
			return
		}

		// Anthropic's OAuth client only accepts a fixed paste-based redirect
		// URI. The user authorizes on claude.ai, sees `code#state` on the
		// console.anthropic.com callback page, and pastes it back via
		// POST /api/oauth/flows/{id}/submit.
		manualPaste := provider == oauthProviderAnthropic
		var redirectURI string
		if manualPaste {
			redirectURI = auth.AnthropicPasteRedirectURI
		} else {
			redirectURI = buildOAuthRedirectURI(r)
		}

		// OpenAI's Codex OAuth client only accepts localhost redirect URIs.
		// In web-server mode the redirect goes to the server domain, which OpenAI rejects.
		if provider == oauthProviderOpenAI && !strings.HasPrefix(redirectURI, "http://localhost") {
			http.Error(w,
				"OpenAI browser OAuth requires direct (localhost) access. Use Device Code instead.",
				http.StatusUnprocessableEntity,
			)
			return
		}

		authURL := oauthBuildAuthorizeURL(cfg, pkce, state, redirectURI)

		now := oauthNow()
		flow := &oauthFlow{
			ID:           newOAuthFlowID(),
			Provider:     provider,
			Method:       method,
			Status:       oauthFlowPending,
			CreatedAt:    now,
			UpdatedAt:    now,
			ExpiresAt:    now.Add(oauthBrowserFlowTTL),
			CodeVerifier: pkce.CodeVerifier,
			OAuthState:   state,
			RedirectURI:  redirectURI,
			ManualPaste:  manualPaste,
		}
		h.storeOAuthFlow(flow)

		resp := map[string]any{
			"status":     "ok",
			"provider":   provider,
			"method":     method,
			"flow_id":    flow.ID,
			"auth_url":   authURL,
			"expires_at": flow.ExpiresAt.Format(time.RFC3339),
		}
		if manualPaste {
			resp["manual_paste"] = true
			resp["redirect_uri"] = redirectURI
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	case oauthMethodClaudeCode:
		cred, err := importClaudeCodeCredential()
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to import Claude Code credential: %v", err), http.StatusInternalServerError)
			return
		}
		if err := h.persistCredentialAndConfig(provider, oauthMethodClaudeCode, cred); err != nil {
			http.Error(w, fmt.Sprintf("failed to save credential: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "ok",
			"provider": provider,
			"method":   oauthMethodClaudeCode,
		})
		return

	case oauthMethodGHCLI:
		cred, err := importGHCLICredential()
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to import GitHub CLI credential: %v", err), http.StatusInternalServerError)
			return
		}
		if err := h.persistCredentialAndConfig(provider, oauthMethodGHCLI, cred); err != nil {
			http.Error(w, fmt.Sprintf("failed to save credential: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "ok",
			"provider": provider,
			"method":   oauthMethodGHCLI,
		})
		return

	default:
		http.Error(w, "unsupported login method", http.StatusBadRequest)
	}
}

func (h *Handler) handleGetOAuthFlow(w http.ResponseWriter, r *http.Request) {
	flowID := strings.TrimSpace(r.PathValue("id"))
	if flowID == "" {
		http.Error(w, "missing flow id", http.StatusBadRequest)
		return
	}

	flow, ok := h.getOAuthFlow(flowID)
	if !ok {
		http.Error(w, "flow not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(flowToResponse(flow))
}

func (h *Handler) handlePollOAuthFlow(w http.ResponseWriter, r *http.Request) {
	flowID := strings.TrimSpace(r.PathValue("id"))
	if flowID == "" {
		http.Error(w, "missing flow id", http.StatusBadRequest)
		return
	}

	flow, ok := h.getOAuthFlow(flowID)
	if !ok {
		http.Error(w, "flow not found", http.StatusNotFound)
		return
	}

	if flow.Method != oauthMethodDeviceCode {
		http.Error(w, "flow does not support polling", http.StatusBadRequest)
		return
	}
	if flow.Status != oauthFlowPending {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(flowToResponse(flow))
		return
	}

	cfg := auth.OpenAIOAuthConfig()
	cred, err := oauthPollDeviceCodeOnce(cfg, flow.DeviceAuthID, flow.UserCode)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "pending") {
			updated, _ := h.getOAuthFlow(flowID)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(flowToResponse(updated))
			return
		}
		h.setOAuthFlowError(flowID, fmt.Sprintf("device code poll failed: %v", err))
		updated, _ := h.getOAuthFlow(flowID)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(flowToResponse(updated))
		return
	}
	if cred == nil {
		updated, _ := h.getOAuthFlow(flowID)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(flowToResponse(updated))
		return
	}

	if err := h.persistCredentialAndConfig(flow.Provider, oauthMethodTokenOrOAuth(flow.Method), cred); err != nil {
		h.setOAuthFlowError(flowID, fmt.Sprintf("failed to save credential: %v", err))
		updated, _ := h.getOAuthFlow(flowID)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(flowToResponse(updated))
		return
	}

	h.setOAuthFlowSuccess(flowID)
	updated, _ := h.getOAuthFlow(flowID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(flowToResponse(updated))
}

// handleSubmitOAuthFlow accepts a paste-based authorization code for OAuth
// providers (like Anthropic) that redirect to a callback page outside the
// launcher's reach. The body is either {"code","state"} or {"paste":"code#state"}.
func (h *Handler) handleSubmitOAuthFlow(w http.ResponseWriter, r *http.Request) {
	flowID := strings.TrimSpace(r.PathValue("id"))
	if flowID == "" {
		http.Error(w, "missing flow id", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req struct {
		Code  string `json:"code"`
		State string `json:"state"`
		Paste string `json:"paste"`
	}
	if err = json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	code := strings.TrimSpace(req.Code)
	state := strings.TrimSpace(req.State)
	if paste := strings.TrimSpace(req.Paste); paste != "" {
		// Anthropic's callback page renders `code#state` for the user to copy.
		// Accept either that exact form, a full URL, or just the code.
		paste = strings.TrimPrefix(paste, auth.AnthropicPasteRedirectURI)
		paste = strings.TrimPrefix(paste, "?code=")
		if idx := strings.Index(paste, "#"); idx >= 0 {
			code = paste[:idx]
			if state == "" {
				state = paste[idx+1:]
			}
		} else if code == "" {
			code = paste
		}
	}
	code = strings.TrimSpace(code)
	state = strings.TrimSpace(state)

	if code == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}

	flow, ok := h.getOAuthFlow(flowID)
	if !ok {
		http.Error(w, "flow not found", http.StatusNotFound)
		return
	}
	if !flow.ManualPaste {
		http.Error(w, "flow does not support manual submit", http.StatusBadRequest)
		return
	}
	if flow.Status != oauthFlowPending {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(flowToResponse(flow))
		return
	}
	if state != "" && state != flow.OAuthState {
		h.setOAuthFlowError(flowID, "state mismatch")
		http.Error(w, "state mismatch", http.StatusBadRequest)
		return
	}

	cfg, err := oauthConfigForProvider(flow.Provider)
	if err != nil {
		h.setOAuthFlowError(flowID, err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	cred, err := oauthExchangeCodeForTokensWithState(cfg, code, flow.CodeVerifier, flow.OAuthState, flow.RedirectURI)
	if err != nil {
		h.setOAuthFlowError(flowID, fmt.Sprintf("token exchange failed: %v", err))
		http.Error(w, fmt.Sprintf("token exchange failed: %v", err), http.StatusBadRequest)
		return
	}

	if err := h.persistCredentialAndConfig(flow.Provider, "oauth", cred); err != nil {
		h.setOAuthFlowError(flowID, fmt.Sprintf("failed to save credential: %v", err))
		http.Error(w, fmt.Sprintf("failed to save credential: %v", err), http.StatusInternalServerError)
		return
	}

	h.setOAuthFlowSuccess(flowID)
	updated, _ := h.getOAuthFlow(flowID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(flowToResponse(updated))
}

func (h *Handler) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	state := strings.TrimSpace(r.URL.Query().Get("state"))
	if state == "" {
		renderOAuthCallbackPage(w, "", oauthFlowError, "Missing state", "missing_state")
		return
	}

	flow, ok := h.getOAuthFlowByState(state)
	if !ok {
		renderOAuthCallbackPage(w, "", oauthFlowError, "OAuth flow not found", "flow_not_found")
		return
	}

	if flow.Status != oauthFlowPending {
		renderOAuthCallbackPage(w, flow.ID, flow.Status, "Flow already completed", flow.Error)
		return
	}

	if errMsg := strings.TrimSpace(r.URL.Query().Get("error")); errMsg != "" {
		if desc := strings.TrimSpace(r.URL.Query().Get("error_description")); desc != "" {
			errMsg += ": " + desc
		}
		h.setOAuthFlowError(flow.ID, errMsg)
		renderOAuthCallbackPage(w, flow.ID, oauthFlowError, "Authorization failed", errMsg)
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		h.setOAuthFlowError(flow.ID, "missing authorization code")
		renderOAuthCallbackPage(w, flow.ID, oauthFlowError, "Missing authorization code", "missing_code")
		return
	}

	cfg, err := oauthConfigForProvider(flow.Provider)
	if err != nil {
		h.setOAuthFlowError(flow.ID, err.Error())
		renderOAuthCallbackPage(w, flow.ID, oauthFlowError, "Unsupported provider", err.Error())
		return
	}

	cred, err := oauthExchangeCodeForTokens(cfg, code, flow.CodeVerifier, flow.RedirectURI)
	if err != nil {
		h.setOAuthFlowError(flow.ID, fmt.Sprintf("token exchange failed: %v", err))
		renderOAuthCallbackPage(w, flow.ID, oauthFlowError, "Token exchange failed", err.Error())
		return
	}

	if err := h.persistCredentialAndConfig(flow.Provider, oauthMethodTokenOrOAuth(flow.Method), cred); err != nil {
		h.setOAuthFlowError(flow.ID, fmt.Sprintf("failed to save credential: %v", err))
		renderOAuthCallbackPage(w, flow.ID, oauthFlowError, "Failed to save credential", err.Error())
		return
	}

	h.setOAuthFlowSuccess(flow.ID)
	renderOAuthCallbackPage(w, flow.ID, oauthFlowSuccess, "Authentication successful", "")
}

func (h *Handler) handleOAuthLogout(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req struct {
		Provider string `json:"provider"`
	}
	if err = json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	provider, err := normalizeOAuthProvider(req.Provider)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := oauthDeleteCredential(provider); err != nil {
		http.Error(w, fmt.Sprintf("failed to delete credential: %v", err), http.StatusInternalServerError)
		return
	}
	if err := h.syncProviderAuthMethod(provider, ""); err != nil {
		http.Error(w, fmt.Sprintf("failed to update config: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":   "ok",
		"provider": provider,
	})
}

func renderOAuthCallbackPage(w http.ResponseWriter, flowID, status, title, errMsg string) {
	payload := map[string]string{
		"type":   "picoclaw-oauth-result",
		"flowId": flowID,
		"status": status,
	}
	if errMsg != "" {
		payload["error"] = errMsg
	}
	payloadJSON, _ := json.Marshal(payload)

	message := title
	if errMsg != "" {
		message = fmt.Sprintf("%s: %s", title, errMsg)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if status == oauthFlowSuccess {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusBadRequest)
	}

	_, _ = fmt.Fprintf(
		w,
		"<!doctype html><html><head><meta charset=\"utf-8\"><title>PicoClaw OAuth</title></head><body><script>(function(){var payload=%s;var hasOpener=false;try{if(window.opener&&!window.opener.closed){window.opener.postMessage(payload,window.location.origin);hasOpener=true}}catch(e){}var target='/credentials?oauth_flow_id='+encodeURIComponent(payload.flowId||'')+'&oauth_status='+encodeURIComponent(payload.status||'');setTimeout(function(){if(hasOpener){window.close();return}window.location.replace(target)},800)})();</script><div style=\"font-family:Inter,system-ui,sans-serif;padding:24px\"><h2>%s</h2><p>%s</p><p>You can close this window.</p></div></body></html>",
		string(payloadJSON),
		html.EscapeString(title),
		html.EscapeString(message),
	)
}

func normalizeOAuthProvider(raw string) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(raw))
	switch provider {
	case "antigravity":
		return oauthProviderGoogleAntigravity, nil
	case "copilot", "github":
		return oauthProviderGitHubCopilot, nil
	case oauthProviderOpenAI, oauthProviderAnthropic, oauthProviderGoogleAntigravity, oauthProviderGitHubCopilot:
		return provider, nil
	default:
		return "", fmt.Errorf("unsupported provider %q", raw)
	}
}

func isOAuthMethodSupported(provider, method string) bool {
	methods := oauthProviderMethods[provider]
	for _, m := range methods {
		if m == method {
			return true
		}
	}
	return false
}

func oauthConfigForProvider(provider string) (auth.OAuthProviderConfig, error) {
	switch provider {
	case oauthProviderOpenAI:
		return auth.OpenAIOAuthConfig(), nil
	case oauthProviderGoogleAntigravity:
		return auth.GoogleAntigravityOAuthConfig(), nil
	case oauthProviderAnthropic:
		return auth.AnthropicOAuthConfig(), nil
	default:
		return auth.OAuthProviderConfig{}, fmt.Errorf("provider %q does not support browser oauth", provider)
	}
}

func oauthMethodTokenOrOAuth(method string) string {
	if method == oauthMethodToken {
		return oauthMethodToken
	}
	return "oauth"
}

func buildOAuthRedirectURI(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
		scheme = strings.Split(forwarded, ",")[0]
	}
	return fmt.Sprintf("%s://%s/oauth/callback", scheme, r.Host)
}

func flowToResponse(flow *oauthFlow) oauthFlowResponse {
	resp := oauthFlowResponse{
		FlowID:      flow.ID,
		Provider:    flow.Provider,
		Method:      flow.Method,
		Status:      flow.Status,
		Error:       flow.Error,
		ManualPaste: flow.ManualPaste,
	}
	if !flow.ExpiresAt.IsZero() {
		resp.ExpiresAt = flow.ExpiresAt.Format(time.RFC3339)
	}
	if flow.Method == oauthMethodDeviceCode {
		resp.UserCode = flow.UserCode
		resp.VerifyURL = flow.VerifyURL
		resp.Interval = flow.Interval
	}
	return resp
}

func newOAuthFlowID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("oauth_%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func (h *Handler) storeOAuthFlow(flow *oauthFlow) {
	now := oauthNow()
	h.oauthMu.Lock()
	defer h.oauthMu.Unlock()

	h.gcOAuthFlowsLocked(now)
	h.oauthFlows[flow.ID] = flow
	if flow.OAuthState != "" {
		h.oauthState[flow.OAuthState] = flow.ID
	}
}

func (h *Handler) getOAuthFlow(flowID string) (*oauthFlow, bool) {
	now := oauthNow()
	h.oauthMu.Lock()
	defer h.oauthMu.Unlock()

	h.gcOAuthFlowsLocked(now)
	flow, ok := h.oauthFlows[flowID]
	if !ok {
		return nil, false
	}
	cp := *flow
	return &cp, true
}

func (h *Handler) getOAuthFlowByState(state string) (*oauthFlow, bool) {
	now := oauthNow()
	h.oauthMu.Lock()
	defer h.oauthMu.Unlock()

	h.gcOAuthFlowsLocked(now)
	flowID, ok := h.oauthState[state]
	if !ok {
		return nil, false
	}
	flow, ok := h.oauthFlows[flowID]
	if !ok {
		delete(h.oauthState, state)
		return nil, false
	}
	cp := *flow
	return &cp, true
}

func (h *Handler) setOAuthFlowSuccess(flowID string) {
	now := oauthNow()
	h.oauthMu.Lock()
	defer h.oauthMu.Unlock()

	flow, ok := h.oauthFlows[flowID]
	if !ok {
		return
	}
	flow.Status = oauthFlowSuccess
	flow.Error = ""
	flow.UpdatedAt = now
	if flow.OAuthState != "" {
		delete(h.oauthState, flow.OAuthState)
	}
}

func (h *Handler) setOAuthFlowError(flowID, errMsg string) {
	now := oauthNow()
	h.oauthMu.Lock()
	defer h.oauthMu.Unlock()

	flow, ok := h.oauthFlows[flowID]
	if !ok {
		return
	}
	flow.Status = oauthFlowError
	flow.Error = errMsg
	flow.UpdatedAt = now
	if flow.OAuthState != "" {
		delete(h.oauthState, flow.OAuthState)
	}
}

func (h *Handler) gcOAuthFlowsLocked(now time.Time) {
	for id, flow := range h.oauthFlows {
		if flow.Status == oauthFlowPending && !flow.ExpiresAt.IsZero() && now.After(flow.ExpiresAt) {
			flow.Status = oauthFlowExpired
			flow.Error = "flow expired"
			flow.UpdatedAt = now
			if flow.OAuthState != "" {
				delete(h.oauthState, flow.OAuthState)
			}
		}

		if flow.Status != oauthFlowPending && now.Sub(flow.UpdatedAt) > oauthTerminalFlowGC {
			if flow.OAuthState != "" {
				delete(h.oauthState, flow.OAuthState)
			}
			delete(h.oauthFlows, id)
		}
	}
}

func (h *Handler) persistCredentialAndConfig(provider, authMethod string, cred *auth.AuthCredential) error {
	if cred == nil {
		return fmt.Errorf("empty credential")
	}

	cp := *cred
	cp.Provider = provider
	if cp.AuthMethod == "" {
		cp.AuthMethod = authMethod
	}

	if provider == oauthProviderGoogleAntigravity {
		if cp.Email == "" {
			email, err := oauthFetchGoogleUserEmailFunc(cp.AccessToken)
			if err != nil {
				logger.ErrorC("oauth", fmt.Sprintf("oauth warning: could not fetch google email: %v", err))
			} else {
				cp.Email = email
			}
		}
		if cp.ProjectID == "" {
			projectID, err := oauthFetchAntigravityProject(cp.AccessToken)
			if err != nil {
				logger.ErrorC("oauth", fmt.Sprintf("oauth warning: could not fetch antigravity project id: %v", err))
			} else {
				cp.ProjectID = projectID
			}
		}
	}

	if err := oauthSetCredential(provider, &cp); err != nil {
		return fmt.Errorf("saving credential: %w", err)
	}
	if err := h.syncProviderAuthMethod(provider, authMethod); err != nil {
		return fmt.Errorf("syncing provider auth config: %w", err)
	}
	return nil
}

func (h *Handler) syncProviderAuthMethod(provider, authMethod string) error {
	cfg, err := oauthLoadConfig(h.configPath)
	if err != nil {
		return err
	}

	found := false
	for i := range cfg.ModelList {
		if modelBelongsToProvider(provider, cfg.ModelList[i]) {
			if provider == oauthProviderGitHubCopilot {
				normalizeGitHubCopilotModelConfig(cfg.ModelList[i])
			}
			cfg.ModelList[i].AuthMethod = authMethod
			found = true
		}
	}

	if !found && authMethod != "" {
		cfg.ModelList = append(cfg.ModelList, defaultModelConfigForProvider(provider, authMethod))
	}

	return oauthSaveConfig(h.configPath, cfg)
}

func normalizeGitHubCopilotModelConfig(modelCfg *config.ModelConfig) {
	if modelCfg == nil {
		return
	}
	modelCfg.Provider = "github-copilot"
	model := strings.ToLower(strings.TrimSpace(modelCfg.Model))
	if model == "" || model == "gpt-4o" {
		modelCfg.Model = "gpt-4.1"
	}
	if strings.TrimSpace(modelCfg.APIBase) == "" ||
		isDefaultGitHubCopilotAPIBase(modelCfg.APIBase) ||
		strings.TrimRight(modelCfg.APIBase, "/") == "https://models.inference.ai.azure.com" {
		modelCfg.APIBase = ""
	}
	if strings.TrimSpace(modelCfg.ConnectMode) == "" {
		modelCfg.ConnectMode = "grpc"
	}
	modelCfg.APIKeys = nil
}

func isDefaultGitHubCopilotAPIBase(apiBase string) bool {
	apiBase = strings.ToLower(strings.TrimRight(strings.TrimSpace(apiBase), "/"))
	return apiBase == "localhost:4321" ||
		apiBase == "http://localhost:4321" ||
		apiBase == "127.0.0.1:4321" ||
		apiBase == "http://127.0.0.1:4321"
}

func modelBelongsToProvider(provider string, modelCfg *config.ModelConfig) bool {
	protocol, _ := providers.ExtractProtocol(modelCfg)
	switch provider {
	case oauthProviderOpenAI:
		return protocol == "openai"
	case oauthProviderAnthropic:
		return protocol == "anthropic"
	case oauthProviderGoogleAntigravity:
		return protocol == "antigravity" || protocol == "google-antigravity"
	case oauthProviderGitHubCopilot:
		return protocol == "github-copilot" || protocol == "copilot" || protocol == "github-models"
	default:
		return false
	}
}

func defaultModelConfigForProvider(provider, authMethod string) *config.ModelConfig {
	switch provider {
	case oauthProviderOpenAI:
		return &config.ModelConfig{
			ModelName:  "gpt-5.4",
			Provider:   "openai",
			Model:      "gpt-5.4",
			AuthMethod: authMethod,
		}
	case oauthProviderAnthropic:
		return &config.ModelConfig{
			ModelName:  "claude-sonnet-4.6",
			Provider:   "anthropic",
			Model:      "claude-sonnet-4-6",
			AuthMethod: authMethod,
		}
	case oauthProviderGoogleAntigravity:
		return &config.ModelConfig{
			ModelName:  "gemini-flash",
			Provider:   "antigravity",
			Model:      "gemini-3-flash",
			AuthMethod: authMethod,
		}
	case oauthProviderGitHubCopilot:
		return &config.ModelConfig{
			ModelName:   "copilot-gpt-4.1",
			Provider:    "github-copilot",
			Model:       "gpt-4.1",
			AuthMethod:  authMethod,
			ConnectMode: "grpc",
		}
	default:
		return &config.ModelConfig{}
	}
}

// importClaudeCodeCredential reads the Anthropic OAuth token stored by the
// Claude Code CLI from ~/.claude/.credentials.json.
func importClaudeCodeCredential() (*auth.AuthCredential, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("finding home dir: %w", err)
	}
	credPath := filepath.Join(homeDir, ".claude", ".credentials.json")
	data, err := os.ReadFile(credPath)
	if err != nil {
		return nil, fmt.Errorf("reading Claude Code credentials (%s): %w", credPath, err)
	}
	var raw struct {
		ClaudeAiOauth struct {
			AccessToken  string `json:"accessToken"`
			RefreshToken string `json:"refreshToken"`
			ExpiresAt    int64  `json:"expiresAt"` // milliseconds since epoch
		} `json:"claudeAiOauth"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing Claude Code credentials: %w", err)
	}
	if raw.ClaudeAiOauth.AccessToken == "" {
		return nil, fmt.Errorf("no access token found in Claude Code credentials at %s", credPath)
	}
	var expiresAt time.Time
	if raw.ClaudeAiOauth.ExpiresAt > 0 {
		expiresAt = time.UnixMilli(raw.ClaudeAiOauth.ExpiresAt)
	}
	return &auth.AuthCredential{
		AccessToken:  raw.ClaudeAiOauth.AccessToken,
		RefreshToken: raw.ClaudeAiOauth.RefreshToken,
		ExpiresAt:    expiresAt,
		Provider:     oauthProviderAnthropic,
		AuthMethod:   oauthMethodClaudeCode,
	}, nil
}

// importGHCLICredential reads a GitHub OAuth token from Copilot/GitHub CLI
// config files, then falls back to `gh auth token`. The command fallback is
// needed on platforms where GitHub CLI stores tokens in the OS keyring instead
// of hosts.yml.
func importGHCLICredential() (*auth.AuthCredential, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("finding home dir: %w", err)
	}

	checkedPaths := githubCredentialPaths(homeDir)
	for _, path := range checkedPaths {
		cred, readErr := importGitHubCredentialFile(path)
		if readErr == nil && cred != nil {
			return cred, nil
		}
	}

	cred, commandErr := importGHCLICredentialFromCommand()
	if commandErr == nil {
		return cred, nil
	}

	return nil, fmt.Errorf(
		"no GitHub credentials found (checked %s; gh auth token failed: %v)",
		strings.Join(checkedPaths, ", "),
		commandErr,
	)
}

func githubCredentialPaths(homeDir string) []string {
	paths := []string{
		filepath.Join(homeDir, ".config", "github-copilot", "hosts.json"),
		filepath.Join(homeDir, ".config", "gh", "hosts.yml"),
	}
	if configDir, err := os.UserConfigDir(); err == nil && configDir != "" {
		paths = append(paths,
			filepath.Join(configDir, "github-copilot", "hosts.json"),
			filepath.Join(configDir, "gh", "hosts.yml"),
			filepath.Join(configDir, "GitHub CLI", "hosts.yml"),
		)
	}
	if ghConfigDir := strings.TrimSpace(os.Getenv("GH_CONFIG_DIR")); ghConfigDir != "" {
		paths = append(paths, filepath.Join(ghConfigDir, "hosts.yml"))
	}

	seen := make(map[string]bool, len(paths))
	unique := make([]string, 0, len(paths))
	for _, path := range paths {
		clean := filepath.Clean(path)
		if clean == "." || seen[clean] {
			continue
		}
		seen[clean] = true
		unique = append(unique, clean)
	}
	return unique
}

func importGitHubCredentialFile(path string) (*auth.AuthCredential, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(filepath.Ext(path), ".json") {
		var hosts map[string]struct {
			OAuthToken string `json:"oauth_token"`
			User       string `json:"user"`
		}
		if err := json.Unmarshal(data, &hosts); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", path, err)
		}
		gh, ok := hosts["github.com"]
		if !ok || gh.OAuthToken == "" {
			return nil, fmt.Errorf("no GitHub token found in %s", path)
		}
		return &auth.AuthCredential{
			AccessToken: gh.OAuthToken,
			AccountID:   gh.User,
			Provider:    oauthProviderGitHubCopilot,
			AuthMethod:  oauthMethodGHCLI,
		}, nil
	}

	var hosts map[string]struct {
		OAuthToken string `yaml:"oauth_token"`
		User       string `yaml:"user"`
	}
	if err := yaml.Unmarshal(data, &hosts); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}

	gh, ok := hosts["github.com"]
	if !ok || gh.OAuthToken == "" {
		return nil, fmt.Errorf("no GitHub token found in %s", path)
	}

	return &auth.AuthCredential{
		AccessToken: gh.OAuthToken,
		AccountID:   gh.User,
		Provider:    oauthProviderGitHubCopilot,
		AuthMethod:  oauthMethodGHCLI,
	}, nil
}

func importGHCLICredentialFromCommand() (*auth.AuthCredential, error) {
	token, err := oauthRunGHCLI("auth", "token", "--hostname", "github.com")
	if err != nil {
		return nil, err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("empty token")
	}

	accountID, _ := oauthRunGHCLI("api", "user", "--jq", ".login")
	return &auth.AuthCredential{
		AccessToken: token,
		AccountID:   strings.TrimSpace(accountID),
		Provider:    oauthProviderGitHubCopilot,
		AuthMethod:  oauthMethodGHCLI,
	}, nil
}

func runGHCLI(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), oauthGHCLIImportTTL)
	defer cancel()

	cmd := exec.CommandContext(ctx, "gh", args...)
	out, err := cmd.Output()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err != nil {
		return "", fmt.Errorf("gh %s: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

func fetchGoogleUserEmail(accessToken string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("userinfo request failed: %s", string(body))
	}

	var userInfo struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return "", err
	}
	if userInfo.Email == "" {
		return "", fmt.Errorf("empty email in userinfo response")
	}
	return userInfo.Email, nil
}
