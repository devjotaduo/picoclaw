package mcp

import (
	"strings"
	"testing"
)

func TestCatalogIDsUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, e := range Catalog {
		if seen[e.ID] {
			t.Errorf("duplicate catalog ID: %q", e.ID)
		}
		seen[e.ID] = true
	}
}

func TestCatalogIDsAreSlugs(t *testing.T) {
	for _, e := range Catalog {
		if e.ID == "" {
			t.Errorf("empty ID in entry %q", e.DisplayName)
		}
		if strings.ContainsAny(e.ID, " _ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
			t.Errorf("ID %q must be lowercase-kebab-case", e.ID)
		}
	}
}

func TestCatalogHasRequiredFields(t *testing.T) {
	for _, e := range Catalog {
		if e.DisplayName == "" {
			t.Errorf("entry %q missing DisplayName", e.ID)
		}
		if e.Category == "" {
			t.Errorf("entry %q missing Category", e.ID)
		}
		if e.Server.Command == "" && e.Server.URL == "" {
			t.Errorf("entry %q has neither Command nor URL", e.ID)
		}
		if e.Server.Type == "" {
			t.Errorf("entry %q missing Server.Type", e.ID)
		}
	}
}

func TestCatalogCoversTemplateIntegrations(t *testing.T) {
	required := []string{
		"knowledge_base",
		"internal_knowledge_base",
		"crm",
		"sales_pipeline",
		"calendar",
		"ecommerce_platform",
		"payment_gateway",
		"email",
		"helpdesk",
		"issue_tracker",
		"ticketing_system",
		"log_storage",
	}
	covered := map[string]bool{}
	for _, e := range Catalog {
		for _, i := range e.Integrations {
			covered[i] = true
		}
	}
	for _, r := range required {
		if !covered[r] {
			t.Errorf("no catalog entry covers integration %q", r)
		}
	}
}

func TestLookup(t *testing.T) {
	e, ok := Lookup("notion")
	if !ok {
		t.Fatal("expected notion to be in catalog")
	}
	if e.DisplayName == "" {
		t.Error("Lookup returned empty entry")
	}
	if _, ok := Lookup("does-not-exist"); ok {
		t.Error("Lookup should return ok=false for unknown ID")
	}
}
