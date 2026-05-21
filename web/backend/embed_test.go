package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnknownAPIPathStays404(t *testing.T) {
	mux := http.NewServeMux()
	registerEmbedRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/not-found", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

func TestMissingAssetStays404(t *testing.T) {
	mux := http.NewServeMux()
	registerEmbedRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/assets/not-found.js", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

// TestFrontendDistDirOverridesEmbedded locks the contract used by the SaaS
// controlplane to inject per-workspace custom frontends: when
// PICOCLAW_FRONTEND_DIST_DIR points at a directory with a non-empty
// index.html, registerEmbedRoutes serves from there. The tenant launcher
// container gets this env via the bind-mount the Provisioner attaches.
func TestFrontendDistDirOverridesEmbedded(t *testing.T) {
	dir := t.TempDir()
	html := `<html><body data-source="workspace-build">hello workspace</body></html>`
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PICOCLAW_FRONTEND_DIST_DIR", dir)

	mux := http.NewServeMux()
	registerEmbedRoutes(mux)

	// Root → index.html from the override directory.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %q", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "workspace-build") {
		t.Errorf("expected workspace-build marker in body; got %q", rr.Body.String())
	}

	// SPA fallback: arbitrary deep path resolves to the override index.
	req2 := httptest.NewRequest(http.MethodGet, "/anything/deep", nil)
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("spa fallback status = %d, want 200", rr2.Code)
	}
	if !strings.Contains(rr2.Body.String(), "workspace-build") {
		t.Errorf("spa fallback didn't serve the override index: %q", rr2.Body.String())
	}
}

// TestFrontendDistDirEmptyFallsBackToEmbed verifies the safety net: if the
// env is set but the bind-mounted directory has no index.html (workspace was
// never compiled), the launcher quietly falls back to its embedded build
// rather than 500ing.
func TestFrontendDistDirEmptyFallsBackToEmbed(t *testing.T) {
	dir := t.TempDir() // empty
	t.Setenv("PICOCLAW_FRONTEND_DIST_DIR", dir)

	mux := http.NewServeMux()
	registerEmbedRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	// We expect 200 (embedded SPA) OR 404 (no embedded dist in test binary).
	// The KEY assertion is that the empty override directory didn't make the
	// handler crash — both outcomes are acceptable.
	if rr.Code != http.StatusOK && rr.Code != http.StatusNotFound {
		t.Fatalf("unexpected status = %d when override dir is empty; body = %q", rr.Code, rr.Body.String())
	}
}
