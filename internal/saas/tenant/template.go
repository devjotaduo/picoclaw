package tenant

// Tenant volume helpers for the clone path. Workspaces own the
// new-tenant flow; this file only carries CopyVolumeRaw (tenant→tenant
// verbatim copy used by CloneFromTenant) and the small file helpers
// shared by both the clone path and the workspace home copy.

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// rawCloneSkipExact lists file/dir names that must NOT be copied during a
// tenant clone — they would conflict with the new container's runtime.
var rawCloneSkipExact = []string{
	".picoclaw.pid",
	"launcher_policy.json", // rewritten from the workspace's RBAC policy
	"runtime-user-env",
	"logs",
}

var rawCloneSkipPrefix = []string{
	"backups/",
}

var rawCloneSkipSuffix = []string{
	".pid",
	".sock",
	".lock",
	".db-wal",
	".db-shm",
	".db-journal",
}

func shouldSkipRawClonePath(rel string) bool {
	rel = filepath.ToSlash(rel)
	if rel == "" || rel == "." {
		return false
	}
	for _, name := range rawCloneSkipExact {
		if rel == name || strings.HasPrefix(rel, name+"/") {
			return true
		}
	}
	for _, prefix := range rawCloneSkipPrefix {
		if strings.HasPrefix(rel, prefix) {
			return true
		}
	}
	for _, suffix := range rawCloneSkipSuffix {
		if strings.HasSuffix(rel, suffix) {
			return true
		}
	}
	return false
}

// CopyVolumeRaw copies a tenant volume verbatim from src to dst — including
// secrets, api keys, OAuth tokens, dashboardauth.db, sessions and memory.
// The blocklist is intentionally tiny: only files that would conflict with
// the new container's runtime (PID/socket/lock files and SQLite WAL/SHM
// journals of in-use databases) are skipped. Used by tenant→tenant clone
// where the explicit intent is an identical replica.
func CopyVolumeRaw(src, dst string) error {
	if src == "" {
		return fmt.Errorf("source volume path is empty")
	}
	info, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("stat source volume: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("source volume %s is not a directory", src)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return fmt.Errorf("mkdir destination: %w", err)
	}
	return filepath.Walk(src, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipRawClonePath(rel) {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		if fi.IsDir() {
			return os.MkdirAll(target, fi.Mode().Perm())
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		if !fi.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return copyFile(path, target, fi.Mode().Perm())
	})
}

// copyFile is the building block for every tenant-volume copy path
// (CopyVolumeRaw, CopyWorkspaceHome). Truncates destination on overwrite
// and fsyncs the result so a hard crash mid-provision doesn't leave a
// half-written byte stream.
func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// kept for the lint-noisy "imported and not used" guard when only one of
// the helpers above is invoked from another file.
var _ = errors.New
