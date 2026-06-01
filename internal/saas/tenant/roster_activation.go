package tenant

// ActivateRosterAgents toggles config.json panel_enabled so exactly the given
// agent ids (plus always-on main) are active in the panel. Ids are normalized
// (Rafael→main, unknowns dropped) via the same rules as the promote path.
// Empty ids is a fail-open no-op (public tenants pass nil → Sofia stays solo).
// "tenant_type" is recorded in the agent-activation.json audit artifact.
func ActivateRosterAgents(volumePath string, ids []string) (RecommendedAgentsActivationResult, error) {
	return activateAgents(volumePath, NormalizeRecommendedAgentIDs(ids), "tenant_type")
}
