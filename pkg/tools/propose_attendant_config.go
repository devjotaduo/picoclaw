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

// ProposeAttendantConfigToolName is the canonical name exposed to the LLM.
const ProposeAttendantConfigToolName = "propose_attendant_config"

// ProposeAttendantConfigTool lets the assistant agent stage a proposed change
// to the attendant agent's configuration. It NEVER applies the change — it
// stages a proposal that the tenant owner approves or rejects from the
// dashboard (approval-always model). On approval the launcher replays the
// payload through the same apply path the dashboard editor uses.
//
// Implementation mirrors NotifyUserTool: POST to the launcher backend at
// /api/attendant-proposals, authenticated with the internal process token the
// launcher exports when it spawns the gateway. Base URL resolves from
// PICOCLAW_LAUNCHER_BASE_URL (default http://127.0.0.1:18800).
type ProposeAttendantConfigTool struct {
	baseURL string
	client  *http.Client
}

// NewProposeAttendantConfigTool builds the tool. Empty baseURL reads
// PICOCLAW_LAUNCHER_BASE_URL with a localhost default.
func NewProposeAttendantConfigTool(baseURL string) *ProposeAttendantConfigTool {
	if baseURL == "" {
		baseURL = strings.TrimSpace(os.Getenv("PICOCLAW_LAUNCHER_BASE_URL"))
	}
	if baseURL == "" {
		baseURL = "http://127.0.0.1:18800"
	}
	return &ProposeAttendantConfigTool{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (t *ProposeAttendantConfigTool) Name() string { return ProposeAttendantConfigToolName }

func (t *ProposeAttendantConfigTool) Description() string {
	return "Stage a proposed change to the attendant agent's configuration for the owner to approve. Use this when the owner asks you to change how the public-facing attendant behaves (its name, tone, personality, presentation, FAQ/knowledge, or behavior toggles). You do NOT apply changes directly — this creates a pending proposal the owner approves or rejects in the dashboard. Provide a clear one-line summary of what changes and why. The 'payload' is the full attendant configuration to apply on approval (same shape the dashboard editor uses); include the complete desired config, not just the diff."
}

func (t *ProposeAttendantConfigTool) PromptMetadata() PromptMetadata {
	return PromptMetadata{
		Layer:  ToolPromptLayerCapability,
		Slot:   ToolPromptSlotTooling,
		Source: ToolPromptSourceRegistry,
	}
}

func (t *ProposeAttendantConfigTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"target_id": map[string]any{
				"type":        "string",
				"description": "Agent id to reconfigure. Use 'main' for the public attendant (the default).",
			},
			"summary": map[string]any{
				"type":        "string",
				"description": "One-line human description of the change shown on the approval card (e.g. 'Tornar o tom mais formal'). Required.",
			},
			"reason": map[string]any{
				"type":        "string",
				"description": "Short rationale for the change (why the owner asked for it). Optional.",
			},
			"payload": map[string]any{
				"type":        "object",
				"description": "Full attendant configuration to apply on approval — same shape as the dashboard agent editor payload (name, template_id, presentation, personality, values, tone, language, behavior, etc.). Include the complete desired configuration.",
			},
		},
		"required": []string{"summary", "payload"},
	}
}

func (t *ProposeAttendantConfigTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	summary, _ := args["summary"].(string)
	summary = strings.TrimSpace(summary)
	if summary == "" {
		return ErrorResult("summary is required (one line describing the change)")
	}

	payload, ok := args["payload"].(map[string]any)
	if !ok || len(payload) == 0 {
		return ErrorResult("payload is required (the full attendant configuration object to apply on approval)")
	}

	targetID, _ := args["target_id"].(string)
	targetID = strings.TrimSpace(targetID)
	if targetID == "" {
		targetID = "main"
	}

	body := map[string]any{
		"target_id": targetID,
		"summary":   summary,
		"payload":   payload,
	}
	if reason, ok := args["reason"].(string); ok && strings.TrimSpace(reason) != "" {
		body["reason"] = strings.TrimSpace(reason)
	}
	// The agent loop injects the calling agent id into args under a stable key
	// when available; fall back to "assistente" so the approval card attributes
	// the proposal to the assistant.
	if pb, ok := args["proposed_by"].(string); ok && strings.TrimSpace(pb) != "" {
		body["proposed_by"] = strings.TrimSpace(pb)
	} else {
		body["proposed_by"] = "assistente"
	}

	buf, err := json.Marshal(body)
	if err != nil {
		return ErrorResult(fmt.Sprintf("marshal payload: %v", err))
	}

	url := t.baseURL + "/api/attendant-proposals"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return ErrorResult(fmt.Sprintf("build request: %v", err))
	}
	req.Header.Set("Content-Type", "application/json")
	// Internal-process auth: the launcher exports PICOCLAW_LAUNCHER_INTERNAL_TOKEN
	// when it spawns the gateway; its LauncherDashboardAuth middleware accepts
	// this header as equivalent to a dashboard session cookie. Without it the
	// endpoint returns 401 because the tool runs in the gateway subprocess.
	if token := strings.TrimSpace(os.Getenv("PICOCLAW_LAUNCHER_INTERNAL_TOKEN")); token != "" {
		req.Header.Set("X-Picoclaw-Internal-Token", token)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return ErrorResult(fmt.Sprintf("propose_attendant_config: launcher unreachable at %s (%v).", t.baseURL, err))
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var bodyBuf bytes.Buffer
		_, _ = bodyBuf.ReadFrom(resp.Body)
		preview := bodyBuf.String()
		if len(preview) > 200 {
			preview = preview[:200] + "..."
		}
		return ErrorResult(fmt.Sprintf("propose_attendant_config: HTTP %d — %s", resp.StatusCode, preview))
	}

	return &ToolResult{
		ForLLM: fmt.Sprintf(
			"Proposal staged for owner approval: %s. The owner must approve it in the dashboard before it takes effect.",
			summary,
		),
		IsError: false,
	}
}
