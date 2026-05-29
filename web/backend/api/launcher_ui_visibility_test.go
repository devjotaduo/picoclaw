package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLauncherUIVisibilityFallsBackToWorkspaceSeed(t *testing.T) {
	home := t.TempDir()
	t.Setenv("PICOCLAW_HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(home, "workspace", uiVisibilityFilename),
		[]byte(
			`{"version":1,"active_profile":"public","default_profile":"public","default_visibility":false,"profiles":{"admin":{"visibility":{}},"tenant":{"visibility":{}},"public":{"visibility":{}},"waiting":{"visibility":{}}}}`,
		),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	h := NewHandler(filepath.Join(home, "config.json"))
	req := httptest.NewRequest(http.MethodGet, "/api/launcher/ui-visibility", nil)
	rec := httptest.NewRecorder()
	h.handleGetLauncherUIVisibility(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET ui visibility = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"active_profile":"public"`) {
		t.Fatalf("response did not come from workspace seed: %s", rec.Body.String())
	}
}

func TestLauncherUIVisibilityRootFileWinsOverWorkspaceSeed(t *testing.T) {
	home := t.TempDir()
	t.Setenv("PICOCLAW_HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(home, "workspace", uiVisibilityFilename),
		[]byte(
			`{"version":1,"active_profile":"public","default_profile":"public","default_visibility":false,"profiles":{"admin":{"visibility":{}},"tenant":{"visibility":{}},"public":{"visibility":{}},"waiting":{"visibility":{}}}}`,
		),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(home, uiVisibilityFilename),
		[]byte(
			`{"version":1,"active_profile":"tenant","default_profile":"tenant","default_visibility":true,"profiles":{"admin":{"visibility":{}},"tenant":{"visibility":{}},"public":{"visibility":{}},"waiting":{"visibility":{}}}}`,
		),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	h := NewHandler(filepath.Join(home, "config.json"))
	req := httptest.NewRequest(http.MethodGet, "/api/launcher/ui-visibility", nil)
	rec := httptest.NewRecorder()
	h.handleGetLauncherUIVisibility(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET ui visibility = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"active_profile":"tenant"`) {
		t.Fatalf("root file should win over workspace seed: %s", rec.Body.String())
	}
}

func TestLauncherUIVisibilityFindsSourceWorkspaceFromDevBackendCwd(t *testing.T) {
	home := t.TempDir()
	t.Setenv("PICOCLAW_HOME", home)

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, "web", "backend"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repo, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(repo, "workspace", uiVisibilityFilename),
		[]byte(
			`{"version":1,"active_profile":"public","default_profile":"public","default_visibility":false,"profiles":{"admin":{"visibility":{}},"tenant":{"visibility":{}},"public":{"visibility":{}},"waiting":{"visibility":{}}}}`,
		),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	oldwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join(repo, "web", "backend")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(oldwd)
	})

	h := NewHandler(filepath.Join(home, "config.json"))
	req := httptest.NewRequest(http.MethodGet, "/api/launcher/ui-visibility", nil)
	rec := httptest.NewRecorder()
	h.handleGetLauncherUIVisibility(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET ui visibility = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"active_profile":"public"`) {
		t.Fatalf("response did not come from source workspace seed: %s", rec.Body.String())
	}
}
