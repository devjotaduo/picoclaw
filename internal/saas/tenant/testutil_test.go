package tenant

import (
	"os"
	"path/filepath"
	"testing"
)

// mustWriteFile creates parent directories as needed and writes content
// to path with the given mode. Fails the test on any error so callers don't
// have to handle the boilerplate.
func mustWriteFile(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// assertFileContent reads path and fails the test if the contents don't
// match want exactly. Used in seeding tests where a single byte drift
// silently breaks production tenants.
func assertFileContent(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(got) != want {
		t.Errorf("%s content mismatch.\nwant: %q\ngot:  %q", path, want, got)
	}
}
