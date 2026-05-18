package tools

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/media"
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
	agentID := orchestrator.CanonicalAgentID(ToolAgentID(ctx))
	if agentID != orchestrator.AgentMarketing && agentID != orchestrator.AgentAssistant {
		return ErrorResult("save_marketing_proposal is available only to marketing or assistente")
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
	store     media.MediaStore
}

func NewGenerateImageTool(workspace string, cfg config.ImageGenerationToolsConfig) *GenerateImageTool {
	return &GenerateImageTool{workspace: workspace, cfg: cfg}
}

func (t *GenerateImageTool) Name() string { return "generate_image" }

func (t *GenerateImageTool) Description() string {
	return "Generate a real image with the configured image provider and save it in workspace assets."
}

func (t *GenerateImageTool) SetMediaStore(store media.MediaStore) {
	t.store = store
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
	agentID := orchestrator.CanonicalAgentID(ToolAgentID(ctx))
	if agentID != orchestrator.AgentMarketing && agentID != orchestrator.AgentAssistant {
		return ErrorResult("generate_image is available only to marketing or assistente")
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

	var imageBytes []byte
	var ext string
	if isOpenRouterImageProvider(apiBase, model) {
		var err error
		imageBytes, ext, err = generateOpenRouterImage(ctx, apiBase, apiKey, model, prompt, size)
		if err != nil {
			return ErrorResult(err.Error()).WithError(err)
		}
	} else {
		var err error
		imageBytes, ext, err = generateOpenAIImage(ctx, apiBase, apiKey, model, prompt, size)
		if err != nil {
			return ErrorResult(err.Error()).WithError(err)
		}
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
	msg := fmt.Sprintf("Image generated and saved: %s", path)
	result := SilentResult(msg)
	result.ArtifactTags = []string{"[file:" + path + "]"}

	if t.store == nil {
		return result
	}
	channel := ToolChannel(ctx)
	chatID := ToolChatID(ctx)
	if channel == "" || chatID == "" {
		return result
	}
	ref, err := t.store.Store(path, media.MediaMeta{
		Filename:      filepath.Base(path),
		ContentType:   generatedImageContentType(ext),
		Source:        "tool:generate_image",
		CleanupPolicy: media.CleanupPolicyForgetOnly,
	}, fmt.Sprintf("tool:generate_image:%s:%s", channel, chatID))
	if err != nil {
		return ErrorResult(fmt.Sprintf("image generated but failed to register media for chat: %v", err)).
			WithError(err)
	}
	result.Media = []string{ref}
	result.DeliverMedia = true
	return result
}

func generatedImageContentType(ext string) string {
	if ext == "" {
		return "image/png"
	}
	if mt := mime.TypeByExtension(ext); mt != "" {
		return mt
	}
	return "image/" + strings.TrimPrefix(strings.ToLower(ext), ".")
}

func generateOpenAIImage(
	ctx context.Context,
	apiBase, apiKey, model, prompt, size string,
) ([]byte, string, error) {
	reqPayload, _ := json.Marshal(map[string]any{
		"model":  model,
		"prompt": prompt,
		"size":   size,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/images/generations", bytes.NewReader(reqPayload))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("image provider returned %d: %s", resp.StatusCode, string(data))
	}
	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, "", err
	}
	if len(parsed.Data) == 0 {
		return nil, "", fmt.Errorf("image provider returned no image data")
	}
	imageBytes, ext, err := fetchImageBytes(ctx, parsed.Data[0].B64JSON, parsed.Data[0].URL)
	if err != nil {
		return nil, "", err
	}
	return imageBytes, ext, nil
}

func generateOpenRouterImage(
	ctx context.Context,
	apiBase, apiKey, model, prompt, size string,
) ([]byte, string, error) {
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "user", "content": prompt},
		},
		"modalities": []string{"image", "text"},
		"stream":     false,
	}
	if imageConfig := openRouterImageConfig(size); len(imageConfig) > 0 {
		body["image_config"] = imageConfig
	}
	reqPayload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/chat/completions", bytes.NewReader(reqPayload))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("image provider returned %d: %s", resp.StatusCode, string(data))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Images []struct {
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
					ImageURLCamel struct {
						URL string `json:"url"`
					} `json:"imageUrl"`
				} `json:"images"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, "", err
	}
	for _, choice := range parsed.Choices {
		for _, image := range choice.Message.Images {
			imageURL := firstString(image.ImageURL.URL, image.ImageURLCamel.URL)
			if imageURL == "" {
				continue
			}
			return fetchImageBytes(ctx, "", imageURL)
		}
	}
	return nil, "", fmt.Errorf("image provider returned no image data")
}

type TenantManagerTool struct {
	configPath string
}

func NewTenantManagerTool(configPath string) *TenantManagerTool {
	return &TenantManagerTool{configPath: configPath}
}

func (t *TenantManagerTool) Name() string { return "tenant_manager" }

func (t *TenantManagerTool) Description() string {
	return "Controlled assistant-only tool for updating allowed tenant workspace orchestration settings."
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
	if orchestrator.CanonicalAgentID(ToolAgentID(ctx)) != orchestrator.AgentAssistant {
		return ErrorResult("tenant_manager is available only to assistente")
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
			if orchestrator.CanonicalAgentID(cfg.Agents.List[i].ID) != orchestrator.AgentAssistant {
				continue
			}
			if cfg.Agents.List[i].Access == nil {
				cfg.Agents.List[i].Access = &config.AgentAccessConfig{}
			}
			cfg.Agents.List[i].Access.WhatsAppDirectEnabled = true
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
	agentID := orchestrator.CanonicalAgentID(ToolAgentID(ctx))
	if agentID != orchestrator.AgentAssistant && agentID != orchestrator.AgentMarketing {
		return ErrorResult("whatsapp_report_query is available only to assistente or marketing")
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
	if data, ext, ok, err := parseImageDataURL(url); ok || err != nil {
		return data, ext, err
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

func isOpenRouterImageProvider(apiBase, model string) bool {
	return strings.Contains(strings.ToLower(apiBase), "openrouter.ai") ||
		strings.Contains(strings.TrimSpace(model), "/")
}

func openRouterImageConfig(size string) map[string]any {
	size = strings.TrimSpace(size)
	if size == "" {
		return nil
	}
	config := map[string]any{}
	if ratio := imageSizeAspectRatio(size); ratio != "" {
		config["aspect_ratio"] = ratio
	} else {
		config["image_size"] = size
	}
	return config
}

func imageSizeAspectRatio(size string) string {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(size)), "x")
	if len(parts) != 2 {
		return ""
	}
	var width, height int
	if _, err := fmt.Sscanf(parts[0], "%d", &width); err != nil {
		return ""
	}
	if _, err := fmt.Sscanf(parts[1], "%d", &height); err != nil {
		return ""
	}
	if width <= 0 || height <= 0 {
		return ""
	}
	g := gcd(width, height)
	return fmt.Sprintf("%d:%d", width/g, height/g)
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 0 {
		return -a
	}
	return a
}

func parseImageDataURL(rawURL string) ([]byte, string, bool, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" || !strings.HasPrefix(rawURL, "data:image/") {
		return nil, "", false, nil
	}
	header, payload, found := strings.Cut(rawURL, ",")
	if !found || strings.TrimSpace(payload) == "" {
		return nil, "", true, fmt.Errorf("image data URL is malformed")
	}
	if !strings.Contains(header, ";base64") {
		return nil, "", true, fmt.Errorf("image data URL must be base64 encoded")
	}
	mimeType := strings.TrimPrefix(header, "data:")
	mimeType = strings.TrimSuffix(mimeType, ";base64")
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))

	ext := ".png"
	switch {
	case strings.Contains(mimeType, "jpeg"), strings.Contains(mimeType, "jpg"):
		ext = ".jpg"
	case strings.Contains(mimeType, "webp"):
		ext = ".webp"
	case strings.Contains(mimeType, "gif"):
		ext = ".gif"
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(payload))
	return data, ext, true, err
}
