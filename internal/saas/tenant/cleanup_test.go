package tenant

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestArchiveAndRemoveVolume(t *testing.T) {
	root := t.TempDir()
	volumeDir := filepath.Join(root, "volume")
	backupDir := filepath.Join(root, "backups")

	// Build a small directory tree with files at different depths.
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(volumeDir, "sub", "nested"), 0o755))
	must(os.WriteFile(filepath.Join(volumeDir, "top.txt"), []byte("hi"), 0o644))
	must(os.WriteFile(filepath.Join(volumeDir, "sub", "a.txt"), []byte("a"), 0o644))
	must(os.WriteFile(filepath.Join(volumeDir, "sub", "nested", "deep.bin"), []byte("deep"), 0o644))

	if err := ArchiveAndRemoveVolume(context.Background(), "alice-7f3a2c", volumeDir, backupDir); err != nil {
		t.Fatal(err)
	}

	// Volume must be gone.
	if _, err := os.Stat(volumeDir); !os.IsNotExist(err) {
		t.Errorf("volume should be removed, stat err=%v", err)
	}

	// Exactly one tarball produced.
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("want 1 tarball, got %d", len(entries))
	}
	name := entries[0].Name()
	if !strings.HasPrefix(name, "alice-7f3a2c-") || !strings.HasSuffix(name, ".tar.gz") {
		t.Errorf("unexpected tarball name: %s", name)
	}

	// Tarball contains all three files with correct contents.
	names, contents := extractTarball(t, filepath.Join(backupDir, name))
	sort.Strings(names)
	want := []string{"sub/a.txt", "sub/nested/deep.bin", "top.txt"}
	sort.Strings(want)
	for i := range want {
		if i >= len(names) || names[i] != want[i] {
			t.Errorf("entry mismatch at %d: want %v got %v", i, want, names)
			break
		}
	}
	if contents["top.txt"] != "hi" || contents["sub/nested/deep.bin"] != "deep" {
		t.Errorf("file content corruption: %+v", contents)
	}
}

func TestArchiveAndRemoveVolume_Missing(t *testing.T) {
	root := t.TempDir()
	// Idempotent: calling on a non-existent volume is a no-op success.
	if err := ArchiveAndRemoveVolume(context.Background(), "x", filepath.Join(root, "nope"), root); err != nil {
		t.Errorf("expected nil error for missing volume, got %v", err)
	}
}

func extractTarball(t *testing.T, path string) (names []string, contents map[string]string) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	defer gz.Close()
	contents = map[string]string{}
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if h.Typeflag == tar.TypeDir {
			continue
		}
		names = append(names, h.Name)
		b, err := io.ReadAll(tr)
		if err != nil {
			t.Fatal(err)
		}
		contents[h.Name] = string(b)
	}
	return names, contents
}
