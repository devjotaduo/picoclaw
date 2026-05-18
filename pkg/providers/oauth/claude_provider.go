package oauthprovider

import (
	"context"
	"fmt"
	"sync"

	"github.com/sipeed/picoclaw/pkg/auth"
	anthropicprovider "github.com/sipeed/picoclaw/pkg/providers/anthropic"
)

// claudeRefreshMu serializes refresh attempts across concurrent requests to
// avoid stampeding the Anthropic token endpoint with the same refresh token.
var claudeRefreshMu sync.Mutex

type ClaudeProvider struct {
	delegate *anthropicprovider.Provider
}

func NewClaudeProvider(token string) *ClaudeProvider {
	return &ClaudeProvider{
		delegate: anthropicprovider.NewProvider(token),
	}
}

func NewClaudeProviderWithBaseURL(token, apiBase string) *ClaudeProvider {
	return &ClaudeProvider{
		delegate: anthropicprovider.NewProviderWithBaseURL(token, apiBase),
	}
}

func NewClaudeProviderWithTokenSource(token string, tokenSource func() (string, error)) *ClaudeProvider {
	return &ClaudeProvider{
		delegate: anthropicprovider.NewProviderWithTokenSource(token, tokenSource),
	}
}

func NewClaudeProviderWithTokenSourceAndBaseURL(
	token string, tokenSource func() (string, error), apiBase string,
) *ClaudeProvider {
	return &ClaudeProvider{
		delegate: anthropicprovider.NewProviderWithTokenSourceAndBaseURL(token, tokenSource, apiBase),
	}
}

func newClaudeProviderWithDelegate(delegate *anthropicprovider.Provider) *ClaudeProvider {
	return &ClaudeProvider{delegate: delegate}
}

func (p *ClaudeProvider) Chat(
	ctx context.Context, messages []Message, tools []ToolDefinition, model string, options map[string]any,
) (*LLMResponse, error) {
	resp, err := p.delegate.Chat(ctx, messages, tools, model, options)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (p *ClaudeProvider) GetDefaultModel() string {
	return p.delegate.GetDefaultModel()
}

func CreateClaudeTokenSource(getCredential func(string) (*auth.AuthCredential, error)) func() (string, error) {
	return func() (string, error) {
		cred, err := getCredential("anthropic")
		if err != nil {
			return "", fmt.Errorf("loading auth credentials: %w", err)
		}
		if cred == nil {
			return "", fmt.Errorf("no credentials for anthropic. Run: picoclaw auth login --provider anthropic")
		}

		// Refresh proactively when the token is within 5 minutes of expiry and
		// we have a refresh token (browser/claude_code OAuth flows). Tokens
		// without expires_at (e.g. long-lived setup tokens via paste) are used
		// as-is.
		if cred.NeedsRefresh() && cred.RefreshToken != "" {
			refreshed, rerr := refreshClaudeCredential(cred)
			if rerr == nil && refreshed != nil {
				cred = refreshed
			}
			// If refresh fails we still try the stale token; the next 401
			// surfaces the auth error to the caller.
		}
		return cred.AccessToken, nil
	}
}

func refreshClaudeCredential(cred *auth.AuthCredential) (*auth.AuthCredential, error) {
	claudeRefreshMu.Lock()
	defer claudeRefreshMu.Unlock()

	// Re-read under lock to avoid duplicate refreshes when several requests
	// arrive at the same time and all see an expiring token.
	current, err := auth.GetCredential("anthropic")
	if err != nil {
		return nil, err
	}
	if current == nil {
		current = cred
	}
	if !current.NeedsRefresh() {
		return current, nil
	}

	cfg := auth.AnthropicOAuthConfig()
	refreshed, err := auth.RefreshAccessToken(current, cfg)
	if err != nil {
		return nil, err
	}
	if refreshed.Provider == "" {
		refreshed.Provider = "anthropic"
	}
	if err := auth.SetCredential("anthropic", refreshed); err != nil {
		return nil, err
	}
	return refreshed, nil
}
