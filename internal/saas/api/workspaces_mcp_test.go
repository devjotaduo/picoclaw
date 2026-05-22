package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
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

// --- DB-backed handler tests (gated on TEST_DB_DSN) ---
//
// These tests invoke the handlers directly (bypassing requireAuth /
// requirePlatformAdmin) with a hand-rolled chi RouteContext to populate URL
// params. The auth middleware is exercised in TestGetMCPCatalogRequiresAuth
// above; what we care about here is the handler semantics: catalog
// validation, required-credential checks, encrypt/decrypt round-trip, and
// store I/O.

// newTestHandlerWithMCPKey returns a Handler wired to a real (migrated) test
// DB with a deterministic 32-byte encryption key. Skips when TEST_DB_DSN is
// unset so CI without postgres still passes vet + compile.
func newTestHandlerWithMCPKey(t *testing.T) *Handler {
	t.Helper()
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN not set; skipping DB-backed MCP handler tests")
	}
	db, err := store.Open(context.Background(), dsn)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatalf("db.Migrate: %v", err)
	}
	t.Cleanup(db.Close)

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	return &Handler{
		Cfg:        &config.Config{},
		Workspaces: &store.WorkspaceStore{DB: db},
		MCP:        &store.WorkspaceMCPStore{DB: db},
		MCPEncKey:  key,
	}
}

// seedWorkspace inserts a minimal workspace row and returns its id. The slug
// is suffixed with a unique token (UnixNano) so re-running the test suite on
// a shared schema doesn't trip the slug/name unique constraints.
func seedWorkspace(t *testing.T, h *Handler, slug string) string {
	t.Helper()
	unique := fmt.Sprintf("%s-%d", slug, time.Now().UnixNano())
	ws := &store.Workspace{
		ID: unique, Name: unique, Slug: unique, HostPath: t.TempDir(),
		RolePolicyJSON: []byte("{}"),
	}
	if err := h.Workspaces.Insert(context.Background(), ws); err != nil {
		t.Fatal(err)
	}
	return ws.ID
}

// withChiParams attaches a chi RouteContext to the request so handlers that
// call chi.URLParam() get the right values when invoked directly (without
// going through the router).
func withChiParams(r *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestPutMCPActivation(t *testing.T) {
	h := newTestHandlerWithMCPKey(t)
	wsID := seedWorkspace(t, h, "ws-put-mcp")

	body := `{"enabled":true,"credentials":{"NOTION_API_KEY":"secret_test"}}`
	r := withChiParams(
		httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/"+wsID+"/mcp/notion", strings.NewReader(body)),
		map[string]string{"id": wsID, "catalog_id": "notion"},
	)
	w := httptest.NewRecorder()
	h.handlePutWorkspaceMCP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT got %d, body: %s", w.Code, w.Body.String())
	}

	// List and verify the row exists with credentials masked.
	r = withChiParams(
		httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+wsID+"/mcp", nil),
		map[string]string{"id": wsID},
	)
	w = httptest.NewRecorder()
	h.handleListWorkspaceMCP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("list got %d, body: %s", w.Code, w.Body.String())
	}
	var got struct {
		Servers []struct {
			CatalogID         string          `json:"catalog_id"`
			Enabled           bool            `json:"enabled"`
			CredentialsMasked map[string]bool `json:"credentials_masked"`
		} `json:"servers"`
	}
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got.Servers) != 1 || got.Servers[0].CatalogID != "notion" {
		t.Fatalf("unexpected list: %+v", got)
	}
	if !got.Servers[0].CredentialsMasked["NOTION_API_KEY"] {
		t.Errorf("credential should be marked present-but-masked, got %+v", got.Servers[0].CredentialsMasked)
	}
	// Defense-in-depth: the response body must not contain the raw secret.
	// (We re-execute list against a buffer so we can re-read the body.)
	r2 := withChiParams(
		httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+wsID+"/mcp", nil),
		map[string]string{"id": wsID},
	)
	w2 := httptest.NewRecorder()
	h.handleListWorkspaceMCP(w2, r2)
	if strings.Contains(w2.Body.String(), "secret_test") {
		t.Fatalf("raw credential leaked in list response: %s", w2.Body.String())
	}
}

func TestPutMCPActivationInvalidCatalog(t *testing.T) {
	h := newTestHandlerWithMCPKey(t)
	wsID := seedWorkspace(t, h, "ws-put-invalid")

	r := withChiParams(
		httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/"+wsID+"/mcp/does-not-exist", strings.NewReader(`{}`)),
		map[string]string{"id": wsID, "catalog_id": "does-not-exist"},
	)
	w := httptest.NewRecorder()
	h.handlePutWorkspaceMCP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400; body: %s", w.Code, w.Body.String())
	}
}

func TestPutMCPActivationMissingRequiredCredential(t *testing.T) {
	h := newTestHandlerWithMCPKey(t)
	wsID := seedWorkspace(t, h, "ws-put-missingcred")

	// notion requires NOTION_API_KEY; pass empty creds map.
	r := withChiParams(
		httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/"+wsID+"/mcp/notion", strings.NewReader(`{"enabled":true,"credentials":{}}`)),
		map[string]string{"id": wsID, "catalog_id": "notion"},
	)
	w := httptest.NewRecorder()
	h.handlePutWorkspaceMCP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("got %d, want 400; body: %s", w.Code, w.Body.String())
	}
}

func TestDeleteMCPActivation(t *testing.T) {
	h := newTestHandlerWithMCPKey(t)
	wsID := seedWorkspace(t, h, "ws-delete-mcp")

	if err := h.MCP.Upsert(context.Background(), &store.WorkspaceMCPServer{
		WorkspaceID: wsID, CatalogID: "notion", Enabled: true,
	}); err != nil {
		t.Fatal(err)
	}

	r := withChiParams(
		httptest.NewRequest(http.MethodDelete, "/api/v1/workspaces/"+wsID+"/mcp/notion", nil),
		map[string]string{"id": wsID, "catalog_id": "notion"},
	)
	w := httptest.NewRecorder()
	h.handleDeleteWorkspaceMCP(w, r)
	if w.Code != http.StatusNoContent {
		t.Errorf("got %d, want 204; body: %s", w.Code, w.Body.String())
	}

	list, err := h.MCP.ListForWorkspace(context.Background(), wsID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Errorf("after DELETE expected empty list, got %+v", list)
	}
}
