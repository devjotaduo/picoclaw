package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SetUIProfileToolName is the canonical tool name exposed to the LLM.
const SetUIProfileToolName = "set_ui_profile"

// uiVisibilityFile is the workspace-relative file that stores UI visibility
// state — which profile is currently active plus per-profile visibility maps.
const uiVisibilityFile = "ui-visibility.json"

// SetUIProfileTool lets the agent switch the active UI visibility profile
// (public / tenant / admin) by updating <workspace>/ui-visibility.json. It
// only mutates the `active_profile` key — all other fields (`profiles`,
// `default_profile`, `default_visibility`, `version`) are preserved when the
// file already exists. If the file is missing it's created with sensible
// defaults so the dashboard has a complete document to read.
type SetUIProfileTool struct {
	workspace string
}

// NewSetUIProfileTool creates the tool bound to a workspace dir. workspace
// should be the agent's workspace root (the same directory used by other
// workspace-aware tools like save_marketing_proposal / customer_lookup).
func NewSetUIProfileTool(workspace string) *SetUIProfileTool {
	return &SetUIProfileTool{workspace: strings.TrimSpace(workspace)}
}

func (t *SetUIProfileTool) Name() string { return SetUIProfileToolName }

func (t *SetUIProfileTool) Description() string {
	return "Switch the active UI visibility profile written to <workspace>/ui-visibility.json. Accepts one of public, tenant, or admin. Preserves the rest of the file. Use when the agent needs to flip the dashboard UI surface for the current workspace."
}

func (t *SetUIProfileTool) PromptMetadata() PromptMetadata {
	return PromptMetadata{
		Layer:  ToolPromptLayerCapability,
		Slot:   ToolPromptSlotTooling,
		Source: ToolPromptSourceRegistry,
	}
}

func (t *SetUIProfileTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"profile": map[string]any{
				"type":        "string",
				"enum":        []string{"public", "tenant", "admin", "waiting"},
				"description": "Which UI visibility profile to activate. Must be one of: public (só chat), tenant (painel completo), admin (tudo), waiting (oculta tudo e mostra mensagem de espera).",
			},
		},
		"required": []string{"profile"},
	}
}

func (t *SetUIProfileTool) Execute(_ context.Context, args map[string]any) *ToolResult {
	profileRaw, _ := args["profile"].(string)
	profile := strings.TrimSpace(profileRaw)
	if profile == "" {
		return ErrorResult("profile is required (public, tenant, admin, or waiting)")
	}
	switch profile {
	case "public", "tenant", "admin", "waiting":
	default:
		return ErrorResult(fmt.Sprintf("profile must be public, tenant, admin, or waiting — got %q", profile))
	}

	workspace := strings.TrimSpace(t.workspace)
	if workspace == "" {
		return ErrorResult("set_ui_profile: workspace path is not configured")
	}

	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return ErrorResult(fmt.Sprintf("set_ui_profile: ensure workspace dir: %v", err))
	}

	path := filepath.Join(workspace, uiVisibilityFile)
	doc := map[string]any{}

	if raw, err := os.ReadFile(path); err == nil {
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &doc); err != nil {
				return ErrorResult(fmt.Sprintf("set_ui_profile: parse existing %s: %v", uiVisibilityFile, err))
			}
		}
	} else if !os.IsNotExist(err) {
		return ErrorResult(fmt.Sprintf("set_ui_profile: read %s: %v", uiVisibilityFile, err))
	}

	if _, ok := doc["version"]; !ok {
		doc["version"] = 1
	}
	if _, ok := doc["default_profile"]; !ok {
		doc["default_profile"] = "tenant"
	}
	if _, ok := doc["default_visibility"]; !ok {
		doc["default_visibility"] = true
	}
	if _, ok := doc["profiles"]; !ok {
		doc["profiles"] = map[string]any{}
	}
	doc["active_profile"] = profile

	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return ErrorResult(fmt.Sprintf("set_ui_profile: marshal: %v", err))
	}
	if err := os.WriteFile(path, out, 0o644); err != nil {
		return ErrorResult(fmt.Sprintf("set_ui_profile: write %s: %v", uiVisibilityFile, err))
	}

	return &ToolResult{
		ForLLM:  fmt.Sprintf("UI profile set to: %s", profile),
		IsError: false,
	}
}
