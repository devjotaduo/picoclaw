package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

const OnboardingStateToolName = "onboarding-state"

type OnboardingStateTool struct {
	workspace string
}

func NewOnboardingStateTool(workspace string) *OnboardingStateTool {
	return &OnboardingStateTool{workspace: strings.TrimSpace(workspace)}
}

func (t *OnboardingStateTool) Name() string { return OnboardingStateToolName }

func (t *OnboardingStateTool) Description() string {
	return "Persist and query onboarding state in workspace/state/onboarding.json (init, set_owner, mark_discovery_done, discovery_close, mark_* and get)."
}

func (t *OnboardingStateTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action": map[string]any{
				"type":        "string",
				"description": "State action: init, set_owner, mark_discovery_done, discovery_close, mark_area_complete, mark_ready_for_promotion, mark_promoted, get, and other mark_* operations supported by state.py.",
			},
			"name": map[string]any{
				"type":        "string",
				"description": "Owner name (for set_owner/discovery_close).",
			},
			"email": map[string]any{
				"type":        "string",
				"description": "Owner email (required by set_owner/discovery_close).",
			},
			"whatsapp": map[string]any{
				"type":        "string",
				"description": "Owner WhatsApp (required by discovery policies).",
			},
			"captured_by": map[string]any{
				"type":        "string",
				"description": "Agent identifier that captured owner data.",
			},
			"segment": map[string]any{
				"type":        "string",
				"description": "Detected segment (for mark_discovery_done/discovery_close).",
			},
			"summary": map[string]any{
				"type":        "string",
				"description": "Discovery summary (for mark_discovery_done/discovery_close).",
			},
			"area": map[string]any{
				"type":        "string",
				"description": "Deepening area (for mark_area_complete).",
			},
			"reason": map[string]any{
				"type":        "string",
				"description": "Reason for override actions.",
			},
			"promoted_by": map[string]any{
				"type":        "string",
				"description": "Actor that promoted the tenant.",
			},
			"error": map[string]any{
				"type":        "string",
				"description": "Error text for mark_bridge_failed.",
			},
		},
		"required": []string{"action"},
	}
}

func (t *OnboardingStateTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	if strings.TrimSpace(t.workspace) == "" {
		return ErrorResult("onboarding-state: workspace not configured")
	}
	action, _ := args["action"].(string)
	if strings.TrimSpace(action) == "" {
		return ErrorResult("onboarding-state: action is required")
	}

	payload := map[string]any{}
	for k, v := range args {
		payload[k] = v
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return ErrorResult("onboarding-state: failed to encode payload: " + err.Error()).WithError(err)
	}

	scriptPath := filepath.Join(t.workspace, "skills", "onboarding-state", "scripts", "state.py")
	cmd := exec.CommandContext(ctx, "python3", scriptPath)
	cmd.Stdin = strings.NewReader(string(raw))
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return ErrorResult(fmt.Sprintf("onboarding-state failed: %s", msg)).WithError(err)
	}

	return SilentResult(strings.TrimSpace(string(out)))
}
