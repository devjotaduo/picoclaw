package tools

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
)

type SaveMarketingProposalTool struct {
	workspace string
}

func NewSaveMarketingProposalTool(workspace string) *SaveMarketingProposalTool {
	return &SaveMarketingProposalTool{workspace: workspace}
}

func (t *SaveMarketingProposalTool) Name() string { return "save_marketing_proposal" }

func (t *SaveMarketingProposalTool) Description() string {
	return "Save a marketing campaign, post, calendar, image, or positioning proposal in the agent workspace for approval and history."
}

func (t *SaveMarketingProposalTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":       map[string]any{"type": "string"},
			"kind":        map[string]any{"type": "string", "description": "campaign, post, image, calendar, positioning, catalog, site, or report"},
			"content":     map[string]any{"type": "string"},
			"asset_paths": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
		"required": []string{"title", "content"},
	}
}

func (t *SaveMarketingProposalTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	agentID := ToolAgentID(ctx)
	if agentID != orchestrator.AgentMarketing && agentID != orchestrator.AgentManager {
		return ErrorResult("save_marketing_proposal is available only to marketing or gerente")
	}
	title, _ := args["title"].(string)
	content, _ := args["content"].(string)
	if strings.TrimSpace(title) == "" || strings.TrimSpace(content) == "" {
		return ErrorResult("title and content are required")
	}
	kind, _ := args["kind"].(string)
	assets := stringSliceArg(args["asset_paths"])
	dir := filepath.Join(t.workspace, "proposals")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	id := uuid.NewString()
	path := filepath.Join(dir, time.Now().UTC().Format("20060102-150405")+"-"+sanitizeIdentifierComponent(title)+".json")
	payload := map[string]any{
		"id":          id,
		"title":       title,
		"kind":        strings.TrimSpace(kind),
		"content":     content,
		"asset_paths": assets,
		"agent_id":    agentID,
		"created_at":  time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.MarshalIndent(payload, "", "  ")
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	return SilentResult(fmt.Sprintf("Marketing proposal saved: %s", path))
}

type GenerateImageTool struct {
	workspace string
	cfg       config.ImageGenerationToolsConfig
}

func NewGenerateImageTool(workspace string, cfg config.ImageGenerationToolsConfig) *GenerateImageTool {
	return &GenerateImageTool{workspace: workspace, cfg: cfg}
}

func (t *GenerateImageTool) Name() string { return "generate_image" }

func (t *GenerateImageTool) Description() string {
	return "Generate a real image with the configured image provider and save it in workspace assets."
}

func (t *GenerateImageTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"prompt": map[string]any{"type": "string"},
			"size":   map[string]any{"type": "string", "description": "Optional size such as 1024x1024"},
			"name":   map[string]any{"type": "string", "description": "Optional file name stem"},
		},
		"required": []string{"prompt"},
	}
}

func (t *GenerateImageTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	agentID := ToolAgentID(ctx)
	if agentID != orchestrator.AgentMarketing && agentID != orchestrator.AgentManager {
		return ErrorResult("generate_image is available only to marketing or gerente")
	}
	prompt, _ := args["prompt"].(string)
	if strings.TrimSpace(prompt) == "" {
		return ErrorResult("prompt is required")
	}
	apiKey := t.cfg.APIKey.String()
	if strings.TrimSpace(apiKey) == "" {
		return ErrorResult("image generation api_key is not configured")
	}
	apiBase := strings.TrimRight(strings.TrimSpace(t.cfg.APIBase), "/")
	if apiBase == "" {
		apiBase = "https://api.openai.com/v1"
	}
	model := firstString(t.cfg.Model, "gpt-image-1")
	size, _ := args["size"].(string)
	size = firstString(size, t.cfg.Size, "1024x1024")

	reqPayload, _ := json.Marshal(map[string]any{
		"model":  model,
		"prompt": prompt,
		"size":   size,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/images/generations", bytes.NewReader(reqPayload))
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ErrorResult(fmt.Sprintf("image provider returned %d: %s", resp.StatusCode, string(data)))
	}
	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	if len(parsed.Data) == 0 {
		return ErrorResult("image provider returned no image data")
	}
	imageBytes, ext, err := fetchImageBytes(ctx, parsed.Data[0].B64JSON, parsed.Data[0].URL)
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	name, _ := args["name"].(string)
	if strings.TrimSpace(name) == "" {
		name = "image-" + uuid.NewString()
	}
	outDir := strings.TrimSpace(t.cfg.OutputDir)
	if outDir == "" {
		outDir = filepath.Join(t.workspace, "assets", "images")
	}
	if !filepath.IsAbs(outDir) {
		outDir = filepath.Join(t.workspace, outDir)
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	path := filepath.Join(outDir, sanitizeIdentifierComponent(name)+ext)
	if err := os.WriteFile(path, imageBytes, 0o644); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	return SilentResult(fmt.Sprintf("Image generated and saved: %s", path))
}

type TenantManagerTool struct {
	configPath string
}

func NewTenantManagerTool(configPath string) *TenantManagerTool {
	return &TenantManagerTool{configPath: configPath}
}

func (t *TenantManagerTool) Name() string { return "tenant_manager" }

func (t *TenantManagerTool) Description() string {
	return "Controlled manager-only tool for updating allowed tenant workspace orchestration settings."
}

func (t *TenantManagerTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action":           map[string]any{"type": "string", "enum": []string{"set_main_subagents", "set_admin_whatsapp_senders"}},
			"allow_agents":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"whatsapp_senders": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"confirm":          map[string]any{"type": "boolean", "description": "Must be true to apply changes"},
		},
		"required": []string{"action", "confirm"},
	}
}

func (t *TenantManagerTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	if ToolAgentID(ctx) != orchestrator.AgentManager {
		return ErrorResult("tenant_manager is available only to gerente")
	}
	confirmed, _ := args["confirm"].(bool)
	if !confirmed {
		return ErrorResult("confirm=true is required")
	}
	action, _ := args["action"].(string)
	cfgPath := firstString(t.configPath, os.Getenv(config.EnvConfig), filepath.Join(config.GetHome(), "config.json"))
	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	orchestrator.EnsureSpecialistConfig(cfg)
	switch action {
	case "set_main_subagents":
		orchestrator.SetMainAllowAgents(cfg, stringSliceArg(args["allow_agents"]))
	case "set_admin_whatsapp_senders":
		for i := range cfg.Agents.List {
			if cfg.Agents.List[i].ID != orchestrator.AgentMain {
				continue
			}
			if cfg.Agents.List[i].Access == nil {
				cfg.Agents.List[i].Access = &config.AgentAccessConfig{}
			}
			cfg.Agents.List[i].Access.WhatsAppAllowedSenders = stringSliceArg(args["whatsapp_senders"])
		}
	default:
		return ErrorResult("unknown tenant_manager action")
	}
	orchestrator.EnsureSpecialistConfig(cfg)
	if err := config.SaveConfig(cfgPath, cfg); err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}
	return SilentResult("tenant orchestration updated")
}

type WhatsAppReportQueryTool struct{}

func NewWhatsAppReportQueryTool() *WhatsAppReportQueryTool { return &WhatsAppReportQueryTool{} }

func (t *WhatsAppReportQueryTool) Name() string { return "whatsapp_report_query" }

func (t *WhatsAppReportQueryTool) Description() string {
	return "Return where WhatsApp inbox report data is available for manual analysis."
}

func (t *WhatsAppReportQueryTool) Parameters() map[string]any {
	return map[string]any{"type": "object", "properties": map[string]any{}}
}

func (t *WhatsAppReportQueryTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	if ToolAgentID(ctx) != orchestrator.AgentManager && ToolAgentID(ctx) != orchestrator.AgentMarketing {
		return ErrorResult("whatsapp_report_query is available only to gerente or marketing")
	}
	return SilentResult("WhatsApp reports are available through the dashboard endpoint /api/whatsapp/reports and the native inbox store.")
}

func stringSliceArg(value any) []string {
	raw, ok := value.([]any)
	if !ok {
		if typed, ok := value.([]string); ok {
			return append([]string(nil), typed...)
		}
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func firstString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func fetchImageBytes(ctx context.Context, b64JSON, url string) ([]byte, string, error) {
	if strings.TrimSpace(b64JSON) != "" {
		data, err := base64.StdEncoding.DecodeString(b64JSON)
		return data, ".png", err
	}
	if strings.TrimSpace(url) == "" {
		return nil, "", fmt.Errorf("image response has neither b64_json nor url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("image download returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, "", err
	}
	ext := ".png"
	if strings.Contains(resp.Header.Get("Content-Type"), "jpeg") {
		ext = ".jpg"
	} else if strings.Contains(resp.Header.Get("Content-Type"), "webp") {
		ext = ".webp"
	}
	return data, ext, nil
}
