package store

import (
	"encoding/json"

	"github.com/sipeed/picoclaw/internal/saas/policy"
)

// MarshalRolePolicy normalizes the given role policy and serializes it to
// JSON for storage in the workspaces.role_policy_json column. Centralized
// here so the workspace store and any future RBAC-aware caller round-trip
// the exact same byte shape.
func MarshalRolePolicy(rp policy.RolePolicy) ([]byte, error) {
	return json.Marshal(policy.NormalizeRolePolicy(rp))
}
