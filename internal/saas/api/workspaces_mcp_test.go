package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

// TestGetMCPCatalog hits the handler directly (no auth middleware) to verify
// the JSON shape the admin UI consumes. The 401 behavior is covered by
// TestGetMCPCatalogRequiresAuth below, which exercises the full router.
func TestGetMCPCatalog(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/mcp/catalog", nil)
	w := httptest.NewRecorder()
	h.handleGetMCPCatalog(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("got %d, want 200; body: %s", w.Code, w.Body.String())
	}
	var body struct {
		Entries []map[string]any `json:"entries"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) < 10 {
		t.Errorf("expected >= 10 entries, got %d", len(body.Entries))
	}
	first := body.Entries[0]
	for _, k := range []string{"id", "name", "category", "description", "credentials"} {
		if _, ok := first[k]; !ok {
			t.Errorf("entry missing %q: %+v", k, first)
		}
	}
}

// TestGetMCPCatalogRequiresAuth ensures the route is registered behind
// requireAuth (no session cookie → 401, never reaches the handler).
func TestGetMCPCatalogRequiresAuth(t *testing.T) {
	h := &Handler{Cfg: &config.Config{}}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/mcp/catalog", nil)
	w := httptest.NewRecorder()
	h.Routes().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("got %d, want 401", w.Code)
	}
}
