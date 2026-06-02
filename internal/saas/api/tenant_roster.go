package api

import (
	"encoding/json"
	"strings"
)

// RosterEntry is one agent spec in a tenant_types.roster_json (v2.0 object
// form). The legacy flat ["attendant","assistant"] form decodes to entries
// with empty ID, which carry no panel activation.
type RosterEntry struct {
	ID     string `json:"id"`
	Role   string `json:"role"`
	Label  string `json:"label"`
	Desc   string `json:"desc"`
	Locked bool   `json:"locked"`
}

// rosterActiveAgentIDs extracts the ordered, de-duplicated agent ids from a
// roster_json blob. Tolerates the legacy string-array form (yields no ids).
func rosterActiveAgentIDs(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var entries []RosterEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		// Any valid JSON string array (the legacy flat form, e.g.
		// ["attendant","assistant"]) carries no per-agent ids → no activation.
		// A truly malformed blob (neither objects nor strings) propagates the
		// original error so a corrupt catalog row fails loudly.
		var legacy []string
		if json.Unmarshal(raw, &legacy) == nil {
			return nil, nil
		}
		return nil, err
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		id := strings.ToLower(strings.TrimSpace(e.ID))
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	// Normalize "no ids" to nil so the empty-raw, legacy, and all-empty-id
	// cases all return the same sentinel (callers may compare against nil).
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}
