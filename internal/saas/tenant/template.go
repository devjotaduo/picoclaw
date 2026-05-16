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
		if strings.HasSuffix(rel, suf) {
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
