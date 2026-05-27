package tenant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// MarkOnboardingPromoted invokes the onboarding-state skill INSIDE the
// tenant container via `docker exec`, so the Python recompute (+
// fcntl.flock from audit P1 #10) actually runs. Replaces the Go
// direct-write in tenants_promote.go::markPromotedInState.
//
// Audit P1 #11 (2026-05-27): writing onboarding.json from Go bypasses
// Python's lock AND recompute_phase_and_blockers — concurrent agent
// writes could lose the promoted_at, AND the blocked_by list could end
// up stale (e.g. still listing "lead_timeout_days" after promotion).
//
// Caller must invoke this BEFORE Recreate (the container still exists
// at that point). On error, caller may fall back to a Go direct-write
// as last resort — DB row is already promoted, losing the state mark
// is recoverable post-hoc but ugly.
func MarkOnboardingPromoted(ctx context.Context, tenantID, actorEmail string) error {
	payload := map[string]string{
		"action":      "mark_promoted",
		"promoted_by": actorEmail,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	cmd := exec.CommandContext(ctx, "docker", "exec", "-i",
		"tenant-"+tenantID,
		"python3",
		"/root/.picoclaw/workspace/skills/onboarding-state/scripts/state.py")
	cmd.Stdin = bytes.NewReader(body)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("docker exec mark_promoted on tenant-%s: %w (stderr=%s)",
			tenantID, err, stderr.String())
	}
	var resp map[string]any
	if jerr := json.Unmarshal(out, &resp); jerr != nil {
		return fmt.Errorf("parse state.py output for tenant-%s: %w (output=%q)",
			tenantID, jerr, string(out))
	}
	if phase, _ := resp["phase"].(string); phase != "promoted" {
		return fmt.Errorf("tenant-%s mark_promoted unexpected phase=%q (full output=%q)",
			tenantID, phase, string(out))
	}
	return nil
}
