package tenant

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

// RecommendedAgentsActivationResult describes what the promote flow did with
// discovery.agentes_recomendados. agent-activation.json mirrors this shape as
// an audit artifact; enforcement happens in config.json via panel_enabled.
type RecommendedAgentsActivationResult struct {
	Applied      bool     `json:"applied"`
	ActiveAgents []string `json:"active_agents"`
	HiddenAgents []string `json:"hidden_agents"`
	Source       string   `json:"source,omitempty"`
	FailOpenWhy  string   `json:"fail_open_why,omitempty"`
	NeedsReload  bool     `json:"needs_reload"`
}

var recommendedAgentAliases = map[string]string{
	"rafael":   "main",
	"main":     "main",
	"clara":    "clara",
	"luna":     "luna",
	"marcos":   "marcos",
	"camila":   "camila",
	"lia":      "lia",
	"sofia":    "sofia",
	"catarina": "catarina",
}

var recommendedAgentToggleSet = map[string]bool{
	"clara":    true,
	"luna":     true,
	"marcos":   true,
	"camila":   true,
	"lia":      true,
	"sofia":    true,
	"catarina": true,
}

// NormalizeRecommendedAgentIDs maps display names and old aliases to the real
// roster ids the launcher understands. Unknown ids are ignored so gaps like
// "agente-cobranca" can stay in the summary without becoming inert config.
func NormalizeRecommendedAgentIDs(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, raw := range values {
		id := recommendedAgentAliases[strings.ToLower(strings.TrimSpace(raw))]
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// ActivateRecommendedAgents applies the discovery recommendation to the
// tenant panel. No recommendation is a fail-open no-op so legacy tenants such
// as brendo7 continue promoting with their current roster.
func ActivateRecommendedAgents(volumePath string) (RecommendedAgentsActivationResult, error) {
	recommended, source, err := readRecommendedAgents(volumePath)
	if err != nil {
		return RecommendedAgentsActivationResult{}, err
	}
	return activateAgents(volumePath, recommended, source)
}

// activateAgents is the shared core: given a normalized list of agent ids and
// the source label for the audit artifact, it toggles panel_enabled in
// config.json and writes agent-activation.json. Empty ids is a fail-open no-op
// that preserves the current config unchanged.
func activateAgents(volumePath string, recommended []string, source string) (RecommendedAgentsActivationResult, error) {
	if len(recommended) == 0 {
		return RecommendedAgentsActivationResult{
			FailOpenWhy: "no_recommended_agents",
		}, nil
	}

	result := RecommendedAgentsActivationResult{
		ActiveAgents: recommendedAuditActive(recommended),
		HiddenAgents: recommendedAuditHidden(recommended),
		Source:       source,
	}

	cfgPath := filepath.Join(volumePath, "config.json")
	raw, err := os.ReadFile(cfgPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			result.FailOpenWhy = "config_json_missing"
			if err := writeRecommendedAgentsAudit(volumePath, result); err != nil {
				return result, err
			}
			return result, nil
		}
		return result, fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return result, fmt.Errorf("parse config.json: %w", err)
	}

	changed, configured, err := applyRecommendedAgentsToConfig(cfg, recommended)
	if err != nil {
		return result, err
	}
	if !configured {
		result.FailOpenWhy = "agents_list_missing"
		if err := writeRecommendedAgentsAudit(volumePath, result); err != nil {
			return result, err
		}
		return result, nil
	}
	if changed {
		out, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return result, fmt.Errorf("marshal config.json: %w", err)
		}
		out = append(out, '\n')
		info, err := os.Stat(cfgPath)
		if err != nil {
			return result, fmt.Errorf("stat config.json: %w", err)
		}
		if err := writeFileAtomic(cfgPath, out, info.Mode().Perm()); err != nil {
			return result, fmt.Errorf("write config.json: %w", err)
		}
		result.Applied = true
		result.NeedsReload = true
	}
	if err := writeRecommendedAgentsAudit(volumePath, result); err != nil {
		return result, err
	}
	return result, nil
}

func readRecommendedAgents(volumePath string) ([]string, string, error) {
	statePath := filepath.Join(volumePath, "workspace", "state", "onboarding.json")
	if ids, err := readRecommendedFromOnboarding(statePath); err != nil {
		return nil, "", err
	} else if len(ids) > 0 {
		return ids, "onboarding.json", nil
	}

	empresaPath := filepath.Join(volumePath, "workspace", "memory", "empresa.md")
	if ids, err := readRecommendedFromEmpresaMD(empresaPath); err != nil {
		return nil, "", err
	} else if len(ids) > 0 {
		return ids, "empresa.md", nil
	}

	clientDir := filepath.Join(volumePath, "workspace", "memory", "jotaduo", "clientes")
	if ids, err := readRecommendedFromClientDossier(clientDir); err != nil {
		return nil, "", err
	} else if len(ids) > 0 {
		return ids, "client_dossier", nil
	}
	return nil, "", nil
}

func readRecommendedFromOnboarding(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read onboarding.json: %w", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse onboarding.json: %w", err)
	}
	discovery, _ := doc["discovery"].(map[string]any)
	return NormalizeRecommendedAgentIDs(recommendedStrings(discovery["agentes_recomendados"])), nil
}

func readRecommendedFromEmpresaMD(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read empresa.md: %w", err)
	}
	lines := strings.Split(string(raw), "\n")
	inSection := false
	var values []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "## ") {
			inSection = strings.EqualFold(trimmed, "## Agentes recomendados")
			continue
		}
		if !inSection || !strings.HasPrefix(trimmed, "-") {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
		if value != "" && !strings.Contains(strings.ToLower(value), "detalhar") {
			values = append(values, value)
		}
	}
	return NormalizeRecommendedAgentIDs(values), nil
}

func readRecommendedFromClientDossier(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read client dossier dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, fmt.Errorf("read client dossier %s: %w", name, err)
		}
		var doc map[string]any
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, fmt.Errorf("parse client dossier %s: %w", name, err)
		}
		ids := NormalizeRecommendedAgentIDs(recommendedStrings(doc["agentes_recomendados"]))
		if len(ids) > 0 {
			return ids, nil
		}
	}
	return nil, nil
}

func recommendedStrings(value any) []string {
	switch v := value.(type) {
	case nil:
		return nil
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, recommendedStrings(item)...)
		}
		return out
	case map[string]any:
		for _, key := range []string{"id", "nome", "name"} {
			if text, ok := v[key].(string); ok {
				return []string{text}
			}
		}
		return nil
	case string:
		return []string{v}
	default:
		return []string{fmt.Sprint(v)}
	}
}

func applyRecommendedAgentsToConfig(cfg map[string]any, recommended []string) (bool, bool, error) {
	agents, ok := cfg["agents"].(map[string]any)
	if !ok {
		return false, false, nil
	}
	list, ok := agents["list"].([]any)
	if !ok || len(list) == 0 {
		return false, false, nil
	}

	recSet := make(map[string]bool, len(recommended))
	for _, id := range recommended {
		recSet[id] = true
	}

	changed := false
	for _, rawAgent := range list {
		agent, ok := rawAgent.(map[string]any)
		if !ok {
			continue
		}
		id, _ := agent["id"].(string)
		id = strings.ToLower(strings.TrimSpace(id))
		if !recommendedAgentToggleSet[id] {
			continue
		}
		access, ok := agent["access"].(map[string]any)
		if !ok || access == nil {
			access = map[string]any{}
			agent["access"] = access
			changed = true
		}
		want := recSet[id]
		if got, ok := access["panel_enabled"].(bool); !ok || got != want {
			access["panel_enabled"] = want
			changed = true
		}
	}
	return changed, true, nil
}

func recommendedAuditActive(recommended []string) []string {
	set := map[string]bool{"main": true}
	for _, id := range recommended {
		if id == "main" || recommendedAgentToggleSet[id] {
			set[id] = true
		}
	}
	return sortedKeys(set)
}

func recommendedAuditHidden(recommended []string) []string {
	recSet := make(map[string]bool, len(recommended))
	for _, id := range recommended {
		recSet[id] = true
	}
	hidden := make(map[string]bool, len(recommendedAgentToggleSet))
	for id := range recommendedAgentToggleSet {
		if !recSet[id] {
			hidden[id] = true
		}
	}
	return sortedKeys(hidden)
}

func sortedKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func writeRecommendedAgentsAudit(volumePath string, result RecommendedAgentsActivationResult) error {
	artifact := RecommendedAgentsActivationResult{
		Applied:      result.Applied,
		ActiveAgents: append([]string(nil), result.ActiveAgents...),
		HiddenAgents: append([]string(nil), result.HiddenAgents...),
		Source:       result.Source,
		FailOpenWhy:  result.FailOpenWhy,
		NeedsReload:  result.NeedsReload,
	}
	dir := filepath.Join(volumePath, "workspace", "config")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir workspace/config: %w", err)
	}
	path := filepath.Join(dir, "agent-activation.json")
	if raw, err := os.ReadFile(path); err == nil {
		var existing RecommendedAgentsActivationResult
		if json.Unmarshal(raw, &existing) == nil && reflect.DeepEqual(existing, artifact) {
			return nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read agent activation audit: %w", err)
	}
	out, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal agent activation audit: %w", err)
	}
	out = append(out, '\n')
	if err := writeFileAtomic(path, out, 0o644); err != nil {
		return fmt.Errorf("write agent activation audit: %w", err)
	}
	return nil
}
