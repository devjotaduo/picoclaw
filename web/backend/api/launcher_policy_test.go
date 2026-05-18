package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// handleGetLauncherPolicy
// ---------------------------------------------------------------------------

func TestHandleGetLauncherPolicy_NoFile(t *testing.T) {
	// setupOAuthTestEnv sets PICOCLAW_HOME to a fresh tempdir, and no
	// launcher_policy.json exists there. The handler should return a permissive
	// default policy with status 200.
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/launcher/policy", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	for _, key := range []string{"role", "feature_ids", "features"} {
		if _, ok := resp[key]; !ok {
			t.Fatalf("response missing field %q", key)
		}
	}

	// Without trusted-gateway claims, role defaults to platform_admin.
	var role string
	if err := json.Unmarshal(resp["role"], &role); err != nil {
		t.Fatalf("unmarshal role: %v", err)
	}
	if role != "platform_admin" {
		t.Fatalf("role = %q, want %q", role, "platform_admin")
	}
}

func TestHandleGetLauncherPolicy_DefaultPolicyPermissive(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/launcher/policy", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	// features should be a map with all entries set to "write" for platform_admin
	var resp struct {
		Features map[string]string `json:"features"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Features) == 0 {
		t.Fatal("features map should not be empty")
	}
	for feature, access := range resp.Features {
		if access != "write" {
			t.Fatalf("feature %q access = %q, want %q (platform_admin is fully permissive)", feature, access, "write")
		}
	}
}

func TestHandleGetLauncherPolicy_WithPolicyFile(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	// Write a restrictive policy file into PICOCLAW_HOME
	picoHome := os.Getenv("PICOCLAW_HOME")
	if picoHome == "" {
		picoHome = filepath.Dir(configPath)
	}
	if err := os.MkdirAll(picoHome, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	policyJSON := `{"role_policy":{"tenant_owner":{"chat":"write","models":"none"}}}`
	policyPath := filepath.Join(picoHome, "launcher_policy.json")
	if err := os.WriteFile(policyPath, []byte(policyJSON), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	h := NewHandler(configPath)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/launcher/policy", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// homeDir
// ---------------------------------------------------------------------------

func TestHomeDir_FromEnv(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	picoHome := os.Getenv("PICOCLAW_HOME")
	h := NewHandler(configPath)
	got := h.homeDir()
	if got != picoHome {
		t.Fatalf("homeDir() = %q, want %q", got, picoHome)
	}
}

func TestHomeDir_FromConfigPath(t *testing.T) {
	// Temporarily unset PICOCLAW_HOME so homeDir falls back to Dir(configPath)
	old := os.Getenv("PICOCLAW_HOME")
	_ = os.Unsetenv("PICOCLAW_HOME")
	t.Cleanup(func() {
		if old != "" {
			_ = os.Setenv("PICOCLAW_HOME", old)
		}
	})

	tmp := t.TempDir()
	configPath := filepath.Join(tmp, "config.json")
	h := NewHandler(configPath)
	got := h.homeDir()
	if got != tmp {
		t.Fatalf("homeDir() = %q, want %q", got, tmp)
	}
}

func TestHomeDir_EmptyConfigPath(t *testing.T) {
	old := os.Getenv("PICOCLAW_HOME")
	_ = os.Unsetenv("PICOCLAW_HOME")
	t.Cleanup(func() {
		if old != "" {
			_ = os.Setenv("PICOCLAW_HOME", old)
		}
	})

	h := NewHandler("")
	got := h.homeDir()
	if got != "" {
		t.Fatalf("homeDir() with empty configPath = %q, want %q", got, "")
	}
}

// ---------------------------------------------------------------------------
// PolicyMiddleware
// ---------------------------------------------------------------------------

func TestPolicyMiddleware_NoTrustedGatewayHeader_PassesThrough(t *testing.T) {
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := h.PolicyMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/some-resource", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected inner handler to be called when no trusted-gateway header is present")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestPolicyMiddleware_UnknownPath_PassesThrough(t *testing.T) {
	// Even with trusted gateway claims, an unknown path must pass through.
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := h.PolicyMiddleware(inner)

	// No X-Picoclaw-Claims header → no trusted gateway claims → passes through
	req := httptest.NewRequest(http.MethodGet, "/unknown-path-xyz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected inner handler to be called for unknown path")
	}
}

func TestPolicyMiddleware_AllowedFeature_PassesThrough(t *testing.T) {
	// Without trusted gateway header, PolicyMiddleware must always forward.
	configPath, cleanup := setupOAuthTestEnv(t)
	defer cleanup()

	h := NewHandler(configPath)
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := h.PolicyMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/api/launcher/policy", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected inner handler to be called")
	}
}
