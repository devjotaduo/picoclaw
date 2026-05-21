package cliprovider

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	copilot "github.com/github/copilot-sdk/go"
)

type GitHubCopilotProvider struct {
	uri         string
	connectMode string // "stdio" or "grpc"

	client  *copilot.Client
	session *copilot.Session

	mu sync.Mutex
}

func NewGitHubCopilotProvider(uri string, connectMode string, model string, githubToken string) (*GitHubCopilotProvider, error) {
	uri = strings.TrimSpace(uri)
	githubToken = strings.TrimSpace(githubToken)
	if connectMode == "" {
		connectMode = "grpc"
	}

	switch connectMode {
	case "stdio":
	case "grpc":
	default:
		return nil, fmt.Errorf("unknown connect mode: %s", connectMode)
	}

	clientOptions := &copilot.ClientOptions{}
	if uri != "" {
		clientOptions.CLIUrl = uri
	} else {
		clientOptions.UseStdio = copilot.Bool(true)
		clientOptions.GitHubToken = githubToken
	}

	client := copilot.NewClient(clientOptions)
	if err := client.Start(context.Background()); err != nil {
		return nil, fmt.Errorf("can't connect to Github Copilot: %w", err)
	}

	session, err := client.CreateSession(context.Background(), &copilot.SessionConfig{
		Model:               model,
		OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
		Hooks:               &copilot.SessionHooks{},
	})
	if err != nil {
		client.Stop()
		return nil, fmt.Errorf("create session failed: %w", err)
	}

	return &GitHubCopilotProvider{
		uri:         uri,
		connectMode: connectMode,
		client:      client,
		session:     session,
	}, nil
}

func (p *GitHubCopilotProvider) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.client != nil {
		p.client.Stop()
		p.client = nil
		p.session = nil
	}
}

func (p *GitHubCopilotProvider) Chat(
	ctx context.Context,
	messages []Message,
	tools []ToolDefinition,
	model string,
	options map[string]any,
) (*LLMResponse, error) {
	type tempMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	out := make([]tempMessage, 0, len(messages))
	for _, msg := range messages {
		out = append(out, tempMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	fullcontent, err := json.Marshal(out)
	if err != nil {
		return nil, fmt.Errorf("marshal messages: %w", err)
	}
	p.mu.Lock()
	session := p.session
	p.mu.Unlock()

	if session == nil {
		return nil, fmt.Errorf("provider closed")
	}

	resp, err := session.SendAndWait(ctx, copilot.MessageOptions{
		Prompt: string(fullcontent),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to send message to copilot: %w", err)
	}

	if resp == nil {
		return nil, fmt.Errorf("empty response from copilot")
	}
	// copilot-sdk/go 0.3 turned SessionEventData into an interface; the
	// assistant reply now arrives as *AssistantMessageData with a plain
	// (non-pointer) Content string. Other event types reach this path
	// only on protocol misuse — treat them as a clear error.
	amd, ok := resp.Data.(*copilot.AssistantMessageData)
	if !ok {
		return nil, fmt.Errorf("unexpected copilot event type %T (want assistant message)", resp.Data)
	}
	if amd.Content == "" {
		return nil, fmt.Errorf("no content in copilot response")
	}

	return &LLMResponse{
		FinishReason: "stop",
		Content:      amd.Content,
	}, nil
}

func (p *GitHubCopilotProvider) GetDefaultModel() string {
	return "gpt-4.1"
}
