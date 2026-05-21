package api

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestResolveWorkspaceFile_Safety locks the path-safety contract of the
// workspace file CRUD endpoint. The admin UI sends arbitrary `path` query
// params; this helper rejects directory traversal, absolute paths, and
// anything outside the three allowed subtrees. A regression here would
// turn the file PUT endpoint into an arbitrary-write primitive.
func TestResolveWorkspaceFile_Safety(t *testing.T) {
	host := filepath.Join(t.TempDir(), "ws-host")

	cases := []struct {
		name    string
		rel     string
		wantErr bool
		errHint string
	}{
		// Happy paths.
		{"home file", "home/config.json", false, ""},
		{"home nested", "home/workspace/AGENT.md", false, ""},
		{"frontend-src file", "frontend-src/src/App.tsx", false, ""},
		{"frontend-dist file", "frontend-dist/index.html", false, ""},

		// Rejections.
		{"empty path", "", true, "required"},
		{"absolute path", "/etc/passwd", true, "relative"},
		{"parent dir simple", "../etc/passwd", true, ".."},
		{"parent dir mixed", "home/../../../etc/passwd", true, ""},
		{"outside subtree", "secrets/keys.txt", true, "home/, frontend-src/, or frontend-dist/"},
		{"root only", ".", true, ".."},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := resolveWorkspaceFile(host, tc.rel)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error for %q, got nil (resolved to %q)", tc.rel, got)
				}
				if tc.errHint != "" && err != nil && !strings.Contains(err.Error(), tc.errHint) {
					t.Errorf("error for %q = %v, want hint %q", tc.rel, err, tc.errHint)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error for %q: %v", tc.rel, err)
				return
			}
			if !strings.HasPrefix(got, host) {
				t.Errorf("resolved path %q escapes host %q", got, host)
			}
		})
	}
}
