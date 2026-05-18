package tenant

// CopyTemplate seeds a freshly-created tenant volume with the contents of a
// "template" PICOCLAW_HOME (e.g. the operator's own ~/.picoclaw with the
// desired models, channel list, and .security.yml. Per-tenant
// state files are blocklisted so each tenant still gets:
//   - its own admin password (launcher-auth.db is reseeded after this runs)
//   - its own WhatsApp pairing (workspace/whatsapp/store.db left absent)
//   - fresh sessions / memory / agent state
//
// Empty templateDir is a no-op (template seeding disabled).

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// pathsToSkip — evaluated against the path relative to templateDir, using
// forward slashes. Exact name match for files; prefix match for directories.
var templateSkip = []string{
	// per-tenant — must be unique per tenant
	"launcher-auth.db",
	"dashboardauth.db",
	"workspace/whatsapp",            // whatsmeow session DB
	"workspace/matrix",              // matrix sync state
	"workspace/sessions",            // per-conversation state
	"workspace/memory",              // agent memory / RAG
	"workspace/state",               // last-channel tracker
	"workspace/nav_visibility.json", // operator's sidebar hide/show prefs — tenants start with default
	"channels",                      // per-channel runtime state (weixin sync, etc.)
	"state",                         // legacy state dir if present
	".picoclaw.pid",
	"logs",
	"runtime-user-env",
	"auth.json",
	"backups",
}

// extensionsToSkip — file-extension blocklist (anywhere in tree).
var templateSkipSuffix = []string{
	".pid",
	".sock",
	".key",
	".db",
}

func shouldSkipTemplatePath(rel string) bool {
	rel = filepath.ToSlash(rel)
	if rel == "" || rel == "." {
		return false
	}
	for _, s := range templateSkip {
		if rel == s || strings.HasPrefix(rel, s+"/") {
			return true
		}
	}
	for _, suf := range templateSkipSuffix {
		if strings.HasSuffix(rel, suf) && !isSharedTemplateKeyPath(rel) {
			return true
		}
	}
	// *.bak.* — leftover backups produced by launcher on config edits
	base := filepath.Base(rel)
	if strings.Contains(base, ".bak.") {
		return true
	}
	return false
}

func isSharedTemplateKeyPath(rel string) bool {
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	switch rel {
	case "openrouter.key", "workspace/openrouter.key":
		return true
	}
	parts := strings.Split(rel, "/")
	return len(parts) == 3 && parts[0] == "agents" && parts[2] == "openrouter.key" && parts[1] != ""
}

// CopyTemplate copies templateDir → dstDir, applying the blocklist above.
// It does NOT overwrite files that already exist in dstDir (so the seeded
// launcher-auth.db survives even if we forgot to blocklist it).
func CopyTemplate(templateDir, dstDir string) error {
	if templateDir == "" {
		return nil
	}
	info, err := os.Stat(templateDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // configured but missing — treat as no-op
		}
		return fmt.Errorf("stat template: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("template %s is not a directory", templateDir)
	}

	return filepath.Walk(templateDir, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(templateDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipTemplatePath(rel) {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		dst := filepath.Join(dstDir, rel)
		if fi.IsDir() {
			return os.MkdirAll(dst, fi.Mode().Perm())
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return nil // skip symlinks; templates should be plain files
		}
		if !fi.Mode().IsRegular() {
			return nil
		}
		if _, err := os.Stat(dst); err == nil {
			return nil // don't clobber files already seeded earlier in pipeline
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		return copyFile(path, dst, fi.Mode().Perm())
	})
}

// SyncTemplateSkills overlays workspace/skills from the main tenant template
// onto a freshly-seeded tenant volume. Launcher profiles can be older or
// narrower than the operator's primary workspace; tenant creation should still
// inherit the current shared skill catalog. Profile-specific skills already
// present on the tenant volume are preserved untouched — including customised
// versions of skills that also exist in the operator template.
func SyncTemplateSkills(templateDir, dstDir string) error {
	if templateDir == "" {
		return nil
	}
	srcRoot := filepath.Join(templateDir, "workspace", "skills")
	info, err := os.Stat(srcRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("stat template skills: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("template skills %s is not a directory", srcRoot)
	}
	dstRoot := filepath.Join(dstDir, "workspace", "skills")
	return filepath.Walk(srcRoot, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(srcRoot, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if fi.Mode()&os.ModeSymlink != 0 || (!fi.Mode().IsRegular() && !fi.IsDir()) {
			return nil
		}
		dst := filepath.Join(dstRoot, rel)
		if fi.IsDir() {
			return os.MkdirAll(dst, fi.Mode().Perm())
		}
		if _, err := os.Stat(dst); err == nil {
			return nil // profile-supplied version wins
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		return copyFile(path, dst, fi.Mode().Perm())
	})
}

// rawCloneSkipExact / rawCloneSkipSuffix list paths that must NOT be copied
// during a raw tenant->tenant clone. Unlike the profile-seed blocklist
// (templateSkip), this is the minimum required to avoid copying live runtime
// state that breaks the new container — secrets, dashboardauth.db, OAuth tokens
// and sessions all travel with the clone on purpose.
var rawCloneSkipExact = []string{
	".picoclaw.pid",
	"launcher_policy.json", // re-derived by CloneFromTenant after copy
}

// directory prefixes whose contents are runtime locks / per-process state and
// would conflict with the new container (paths use forward slashes, evaluated
// relative to the volume root). Sub-paths under these are skipped.
var rawCloneSkipPrefix = []string{
	"logs",
	"runtime-user-env",
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
	for _, s := range rawCloneSkipExact {
		if rel == s {
			return true
		}
	}
	for _, p := range rawCloneSkipPrefix {
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	for _, suf := range rawCloneSkipSuffix {
		if strings.HasSuffix(rel, suf) {
			return true
		}
	}
	return false
}

// CopyVolumeRaw copies a tenant volume verbatim from src to dst — including
// secrets, api keys, OAuth tokens, dashboardauth.db, sessions and memory.
// The blocklist is intentionally tiny: only files that would conflict with the
// new container's runtime (PID/socket/lock files and SQLite WAL/SHM journals
// of in-use databases) are skipped. Use this for platform-admin "clone tenant"
// flows where the explicit intent is an identical replica.
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
