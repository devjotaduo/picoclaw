package api

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// buildZip writes the given (name → content) map into a zip and returns it.
// Use a trailing slash on the name to mark it as a directory entry.
func buildZip(t *testing.T, entries map[string]string) *zip.Reader {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range entries {
		// Directory entry has no payload — zip.Writer creates one when
		// Name ends with "/".
		hdr := &zip.FileHeader{Name: name, Method: zip.Deflate}
		if content == "" && len(name) > 0 && name[len(name)-1] == '/' {
			hdr.Method = zip.Store
		}
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatalf("zip create %q: %v", name, err)
		}
		if content != "" {
			if _, err := w.Write([]byte(content)); err != nil {
				t.Fatalf("zip write %q: %v", name, err)
			}
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("zip close: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("zip reader: %v", err)
	}
	return zr
}

// mustExtract validates + extracts into a fresh tmpdir (also creating the
// three workspace subdirs first, like the real handler does) and returns
// the root path. Fails the test if validation or extraction errors.
func mustExtract(t *testing.T, zr *zip.Reader) string {
	t.Helper()
	if err := validateWorkspaceZip(zr); err != nil {
		t.Fatalf("validate: %v", err)
	}
	dst := t.TempDir()
	for _, sub := range []string{
		tenant.WorkspaceHomeSubdir,
		tenant.WorkspaceFrontendSrcSubdir,
		tenant.WorkspaceFrontendDistSubdir,
	} {
		if err := os.MkdirAll(filepath.Join(dst, sub), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", sub, err)
		}
	}
	if err := extractWorkspaceZip(zr, dst); err != nil {
		t.Fatalf("extract: %v", err)
	}
	return dst
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

// Layout (a): every entry under home/ prefix.
func TestExtractWorkspaceZip_HomeStrippedLayout(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"home/config.json":        `{"k":"v"}`,
		"home/workspace/AGENT.md": "# Agent",
		"home/workspace/SOUL.md":  "# Soul",
		"home/.security.yml":      "version: 1",
	})

	dst := mustExtract(t, zr)

	if got := readFile(t, filepath.Join(dst, "home", "config.json")); got != `{"k":"v"}` {
		t.Errorf("home/config.json mismatch: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "home", "workspace", "AGENT.md")); got != "# Agent" {
		t.Errorf("home/workspace/AGENT.md mismatch: %q", got)
	}
	// frontend-src and frontend-dist must remain empty.
	for _, sub := range []string{"frontend-src", "frontend-dist"} {
		entries, _ := os.ReadDir(filepath.Join(dst, sub))
		if len(entries) != 0 {
			t.Errorf("expected %s empty, has %d entries", sub, len(entries))
		}
	}
}

// Layout (b): bare entries at root, no recognized top-level dir. Should be
// treated as a home/ payload (backwards-compat).
func TestExtractWorkspaceZip_BareHomeLayout(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"config.json":        `{"bare":true}`,
		"workspace/AGENT.md": "# Bare agent",
		".security.yml":      "version: 1",
	})

	dst := mustExtract(t, zr)

	if got := readFile(t, filepath.Join(dst, "home", "config.json")); got != `{"bare":true}` {
		t.Errorf("home/config.json mismatch: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "home", "workspace", "AGENT.md")); got != "# Bare agent" {
		t.Errorf("home/workspace/AGENT.md mismatch: %q", got)
	}
}

// Layout (c): zip carries home/, frontend-src/, frontend-dist/ in parallel.
// Each routes to its matching subdir without further rewriting.
func TestExtractWorkspaceZip_MultiFolderLayout(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"home/config.json":            `{"home":true}`,
		"home/workspace/AGENT.md":     "# Agent",
		"frontend-src/package.json":   `{"name":"x"}`,
		"frontend-src/src/App.tsx":    "export default function App(){}",
		"frontend-dist/index.html":    "<html>built</html>",
		"frontend-dist/assets/app.js": "console.log('built')",
	})

	dst := mustExtract(t, zr)

	cases := map[string]string{
		"home/config.json":            `{"home":true}`,
		"home/workspace/AGENT.md":     "# Agent",
		"frontend-src/package.json":   `{"name":"x"}`,
		"frontend-src/src/App.tsx":    "export default function App(){}",
		"frontend-dist/index.html":    "<html>built</html>",
		"frontend-dist/assets/app.js": "console.log('built')",
	}
	for rel, want := range cases {
		if got := readFile(t, filepath.Join(dst, filepath.FromSlash(rel))); got != want {
			t.Errorf("%s mismatch: got %q, want %q", rel, got, want)
		}
	}
}

// Layout (c) subset: zip with only frontend-dist (e.g. refreshing the
// compiled bundle without touching home/).
func TestExtractWorkspaceZip_FrontendDistOnly(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"frontend-dist/index.html": "<html>only dist</html>",
	})

	dst := mustExtract(t, zr)

	if got := readFile(t, filepath.Join(dst, "frontend-dist", "index.html")); got != "<html>only dist</html>" {
		t.Errorf("frontend-dist/index.html mismatch: %q", got)
	}
	// home/ must remain empty.
	entries, _ := os.ReadDir(filepath.Join(dst, "home"))
	if len(entries) != 0 {
		t.Errorf("expected home/ empty, has %d entries", len(entries))
	}
}

// Runtime-skip applies to home/ subtree only — paths like
// home/workspace/sessions/ must be silently dropped (not extracted, not
// rejected). frontend-src/node_modules/ likewise gets the home-style
// skip via the workspace/node_modules path (TODO: extend if needed).
func TestExtractWorkspaceZip_RuntimePathsSkipped(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"home/config.json":                 `{"k":"v"}`,
		"home/workspace/sessions/old.json": `{"runtime":"state"}`,
		"home/workspace/whatsapp/store.db": "binary-garbage",
		"home/launcher-auth.db":            "more-garbage",
	})

	dst := mustExtract(t, zr)

	if got := readFile(t, filepath.Join(dst, "home", "config.json")); got != `{"k":"v"}` {
		t.Errorf("home/config.json should still be extracted: %q", got)
	}
	for _, runtimeRel := range []string{
		"home/workspace/sessions/old.json",
		"home/workspace/whatsapp/store.db",
		"home/launcher-auth.db",
	} {
		if _, err := os.Stat(filepath.Join(dst, filepath.FromSlash(runtimeRel))); !os.IsNotExist(err) {
			t.Errorf("runtime path %s should have been skipped, got err=%v", runtimeRel, err)
		}
	}
}

// frontend-src/node_modules/ and other build caches must be silently
// skipped — they'd otherwise blow the 50 MiB upload cap and they're
// regenerated by `pnpm install` anyway. frontend-dist/, in contrast,
// is the build output we DO want to keep.
func TestExtractWorkspaceZip_FrontendSrcSkipsNodeModulesAndBuildCaches(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"frontend-src/package.json":            `{"name":"x"}`,
		"frontend-src/src/App.tsx":             "export default function App(){}",
		"frontend-src/node_modules/react/x.js": "module.exports={}",
		"frontend-src/.cache/foo":              "cache-data",
		"frontend-src/.git/config":             "[core]",
		"frontend-src/dist/old-output.js":      "stale",
		"frontend-src/.next/build-manifest":    "{}",
		"frontend-src/.svelte-kit/types.ts":    "// auto-gen",
		"frontend-src/.turbo/cache":            "blob",
		"frontend-dist/assets/legit.js":        "// real build output, keep",
	})

	dst := mustExtract(t, zr)

	// What SHOULD be present:
	if got := readFile(t, filepath.Join(dst, "frontend-src", "package.json")); got != `{"name":"x"}` {
		t.Errorf("frontend-src/package.json missing or wrong: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "frontend-src", "src", "App.tsx")); got != "export default function App(){}" {
		t.Errorf("frontend-src/src/App.tsx missing")
	}
	if got := readFile(t, filepath.Join(dst, "frontend-dist", "assets", "legit.js")); got != "// real build output, keep" {
		t.Errorf("frontend-dist/assets/legit.js missing — must NOT be skipped")
	}

	// What MUST NOT be present:
	skipped := []string{
		"frontend-src/node_modules/react/x.js",
		"frontend-src/.cache/foo",
		"frontend-src/.git/config",
		"frontend-src/dist/old-output.js",
		"frontend-src/.next/build-manifest",
		"frontend-src/.svelte-kit/types.ts",
		"frontend-src/.turbo/cache",
	}
	for _, rel := range skipped {
		if _, err := os.Stat(filepath.Join(dst, filepath.FromSlash(rel))); !os.IsNotExist(err) {
			t.Errorf("%s should have been skipped, got err=%v", rel, err)
		}
	}
}

// Path traversal attempts must still be rejected at validation, not
// silently extracted.
func TestValidateWorkspaceZip_RejectsPathTraversal(t *testing.T) {
	zr := buildZip(t, map[string]string{
		"home/../../etc/passwd": "root:x:0:0",
	})
	if err := validateWorkspaceZip(zr); err == nil {
		t.Fatal("expected validation to reject .. path, got nil")
	}
}

// detectArchiveLayout unit-test for the layout decision matrix.
func TestDetectArchiveLayout(t *testing.T) {
	tests := []struct {
		name    string
		entries map[string]string
		want    archiveLayout
	}{
		{"home only", map[string]string{"home/x": "a"}, layoutHomeStripped},
		{"bare", map[string]string{"x": "a"}, layoutBareHome},
		{"multi", map[string]string{"home/x": "a", "frontend-src/y": "b"}, layoutMultiFolder},
		{"only frontend-dist", map[string]string{"frontend-dist/z": "c"}, layoutMultiFolder},
		{"mixed unknown forces bare", map[string]string{"home/x": "a", "weird/y": "b"}, layoutBareHome},
		{"empty", map[string]string{}, layoutBareHome},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			zr := buildZip(t, tc.entries)
			if got := detectArchiveLayout(zr); got != tc.want {
				t.Errorf("got layout %d, want %d", got, tc.want)
			}
		})
	}
}
