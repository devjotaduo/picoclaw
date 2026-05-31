package tenant

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// SetAgentsRoster patches agents.roster in the tenant volume's config.json so
// the in-tenant orchestrator materializes exactly that roster at boot (v2.0
// vertical tenants: typically ["attendant","assistant"]). No-op for an empty
// roster or a missing config.json. Only the agents object is re-serialized;
// every other top-level field keeps its exact bytes, so placeholder tokens like
// ${LITELLM_KEY} survive for the later SubstituteConfigPlaceholders pass and
// ValidateBundle still sees a well-formed config.
func SetAgentsRoster(volumeDir string, roster []string) error {
	if len(roster) == 0 {
		return nil
	}
	path := filepath.Join(volumeDir, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read config.json: %w", err)
	}

	var top map[string]json.RawMessage
	if err = json.Unmarshal(data, &top); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}

	agents := map[string]json.RawMessage{}
	if raw, ok := top["agents"]; ok && len(raw) > 0 {
		if err = json.Unmarshal(raw, &agents); err != nil {
			return fmt.Errorf("parse config.json agents: %w", err)
		}
	}
	rosterRaw, err := json.Marshal(roster)
	if err != nil {
		return fmt.Errorf("marshal roster: %w", err)
	}
	agents["roster"] = rosterRaw
	agentsRaw, err := json.Marshal(agents)
	if err != nil {
		return fmt.Errorf("marshal agents: %w", err)
	}
	top["agents"] = agentsRaw

	out, err := json.MarshalIndent(top, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat config.json: %w", err)
	}
	if err := os.WriteFile(path, out, info.Mode().Perm()); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}
