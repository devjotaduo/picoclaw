package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// NotifyUserToolName é o nome canonicalmente exposto ao LLM.
const NotifyUserToolName = "notify_user"

// NotifyUserTool permite que o agente (main/pixel/doc/dev) dispare uma
// notificação curta pro painel do usuário. A notificação aparece no card
// "Notificações" no rodapé do sidebar do launcher (web/frontend).
//
// Tipos suportados:
//   - data:    atualização ou número (verde, ícone gráfico)
//   - warning: algo a olhar (âmbar, ícone alerta)
//   - billing: cobrança / limite (azul, ícone cartão)
//
// Implementação: POST para o launcher backend em /api/notifications.
// A URL base é resolvida via env PICOCLAW_LAUNCHER_BASE_URL (default
// http://127.0.0.1:18800), permitindo dev/test override.
type NotifyUserTool struct {
	baseURL string
	client  *http.Client
}

// NewNotifyUserTool cria a tool. Se baseURL for vazio, lê de
// PICOCLAW_LAUNCHER_BASE_URL com default http://127.0.0.1:18800.
func NewNotifyUserTool(baseURL string) *NotifyUserTool {
	if baseURL == "" {
		baseURL = strings.TrimSpace(os.Getenv("PICOCLAW_LAUNCHER_BASE_URL"))
	}
	if baseURL == "" {
		baseURL = "http://127.0.0.1:18800"
	}
	return &NotifyUserTool{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (t *NotifyUserTool) Name() string { return NotifyUserToolName }

func (t *NotifyUserTool) Description() string {
	return "Send a short notification to the user's panel (data update, warning, or billing alert). Visible in the launcher sidebar. Use sparingly — only for information the user needs to see asynchronously, not for chat responses. Keep title under 60 chars and body under 200 chars."
}

func (t *NotifyUserTool) PromptMetadata() PromptMetadata {
	return PromptMetadata{
		Layer:  ToolPromptLayerCapability,
		Slot:   ToolPromptSlotTooling,
		Source: ToolPromptSourceRegistry,
	}
}

func (t *NotifyUserTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"kind": map[string]any{
				"type":        "string",
				"enum":        []string{"data", "warning", "billing"},
				"description": "Tipo da notificação: 'data' para números/métricas, 'warning' para algo que requer atenção, 'billing' para cobrança/limite.",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Título curto da notificação (até 60 caracteres). Obrigatório.",
			},
			"body": map[string]any{
				"type":        "string",
				"description": "Corpo opcional explicando a notificação (até 200 caracteres).",
			},
			"agent_id": map[string]any{
				"type":        "string",
				"description": "ID do agente que está disparando (ex: 'rafael', 'pixel', 'doc', 'dev'). Aparece como atribuição no card.",
			},
			"cta_url": map[string]any{
				"type":        "string",
				"description": "URL opcional para ação relacionada (ex: link de fatura, relatório). Aparece como botão.",
			},
			"cta_label": map[string]any{
				"type":        "string",
				"description": "Texto opcional do botão CTA (default: 'Abrir').",
			},
		},
		"required": []string{"kind", "title"},
	}
}

func (t *NotifyUserTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	kind, _ := args["kind"].(string)
	kind = strings.TrimSpace(kind)
	if kind == "" {
		return ErrorResult("kind is required (data, warning, or billing)")
	}
	switch kind {
	case "data", "warning", "billing":
	default:
		return ErrorResult(fmt.Sprintf("kind must be data, warning, or billing — got %q", kind))
	}

	title, _ := args["title"].(string)
	title = strings.TrimSpace(title)
	if title == "" {
		return ErrorResult("title is required")
	}
	if len(title) > 120 {
		return ErrorResult("title exceeds 120 chars; rewrite shorter")
	}

	body, _ := args["body"].(string)
	body = strings.TrimSpace(body)
	if len(body) > 600 {
		return ErrorResult("body exceeds 600 chars; rewrite shorter")
	}

	payload := map[string]any{
		"kind":  kind,
		"title": title,
	}
	if body != "" {
		payload["body"] = body
	}
	if v, ok := args["agent_id"].(string); ok && strings.TrimSpace(v) != "" {
		payload["agent_id"] = strings.TrimSpace(v)
	}
	if v, ok := args["cta_url"].(string); ok && strings.TrimSpace(v) != "" {
		payload["cta_url"] = strings.TrimSpace(v)
	}
	if v, ok := args["cta_label"].(string); ok && strings.TrimSpace(v) != "" {
		payload["cta_label"] = strings.TrimSpace(v)
	}

	buf, err := json.Marshal(payload)
	if err != nil {
		return ErrorResult(fmt.Sprintf("marshal payload: %v", err))
	}

	url := t.baseURL + "/api/notifications"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return ErrorResult(fmt.Sprintf("build request: %v", err))
	}
	req.Header.Set("Content-Type", "application/json")
	// Internal-process auth: launcher exports PICOCLAW_LAUNCHER_INTERNAL_TOKEN
	// when it spawns the gateway. The launcher's LauncherDashboardAuth
	// middleware accepts this header as equivalent to a dashboard session
	// cookie. Without it, /api/notifications returns 401 because the tool
	// runs in the gateway subprocess and has no browser cookie.
	if token := strings.TrimSpace(os.Getenv("PICOCLAW_LAUNCHER_INTERNAL_TOKEN")); token != "" {
		req.Header.Set("X-Picoclaw-Internal-Token", token)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return ErrorResult(fmt.Sprintf("notify_user: launcher unreachable at %s (%v). Verifique se o launcher está rodando.", t.baseURL, err))
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var bodyBuf bytes.Buffer
		_, _ = bodyBuf.ReadFrom(resp.Body)
		preview := bodyBuf.String()
		if len(preview) > 200 {
			preview = preview[:200] + "..."
		}
		return ErrorResult(fmt.Sprintf("notify_user: HTTP %d — %s", resp.StatusCode, preview))
	}

	return &ToolResult{
		ForLLM:  fmt.Sprintf("Notification (%s) dispatched: %s", kind, title),
		IsError: false,
	}
}
