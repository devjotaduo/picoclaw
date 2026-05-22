package api

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// baselineWorkspaceFS embeds the minimal generic workspace template shipped
// with the binary. The bootstrap extracts it into the default workspace's
// home/workspace/ when the legacy /srv/picoclaw/workspace/ host path is not
// available. See baseline-workspace/README.md for content rules.
//
//go:embed all:baseline-workspace
var baselineWorkspaceFS embed.FS

// defaultWorkspaceSlug is the slug used for the bootstrap-created workspace.
// Matches the historical PICOCLAW_SAAS_AUTO_PROVISION_PROFILE default so any
// docs or env that referenced it keep working.
const defaultWorkspaceSlug = "default-business"

// canonicalWorkspaceSource is the host path bind-mounted into the controlplane
// container at /srv/picoclaw:ro by docker-compose. When present, its contents
// are copied into the bootstrapped workspace's home/workspace/ so Clara's first
// auto-provision lands a fully-seeded tenant instead of an empty one.
const canonicalWorkspaceSource = "/srv/picoclaw/workspace"

// EnsureDefaultWorkspace creates a default-auto workspace on first run so
// AutoProvisioner.Run does not fail with "no default workspace marked" the
// first time Clara qualifies a lead. Idempotent: when a default-auto workspace
// already exists, this is a no-op. Failures are logged and returned so the
// controlplane startup can decide whether to keep going (recommended) or hard-
// fail on bootstrap issues — current behaviour is to keep going with a WARN.
func (h *Handler) EnsureDefaultWorkspace(ctx context.Context) error {
	if h.Workspaces == nil {
		return nil
	}

	// Fast path: already have a default.
	if existing, err := h.Workspaces.GetDefaultAuto(ctx); err == nil && existing != nil {
		return nil
	} else if err != nil && !errors.Is(err, store.ErrWorkspaceNotFound) {
		return fmt.Errorf("query default workspace: %w", err)
	}

	workspaceDir := h.Cfg.WorkspaceDir
	if workspaceDir == "" {
		return fmt.Errorf("PICOCLAW_WORKSPACE_DIR not configured; cannot bootstrap default workspace")
	}

	slug := defaultWorkspaceSlug
	hostPath := filepath.Join(workspaceDir, slug)

	// Pre-create the three subdirs the workspace API also creates. Idempotent.
	for _, sub := range []string{
		tenant.WorkspaceHomeSubdir,
		tenant.WorkspaceFrontendSrcSubdir,
		tenant.WorkspaceFrontendDistSubdir,
	} {
		if err := os.MkdirAll(filepath.Join(hostPath, sub), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", sub, err)
		}
	}

	homeDir := filepath.Join(hostPath, tenant.WorkspaceHomeSubdir)

	// Seed home/workspace/ from the canonical source if it exists, else fall
	// back to the embedded baseline (always present in the binary). This keeps
	// legacy installs that bind-mount /srv/picoclaw:ro working unchanged, and
	// gives fresh installs without that mount a real (if generic) baseline
	// instead of an empty workspace that would fail to boot a tenant.
	workspaceDest := filepath.Join(homeDir, "workspace")
	if _, err := os.Stat(workspaceDest); errors.Is(err, os.ErrNotExist) {
		switch {
		case isUsableDir(canonicalWorkspaceSource):
			if err := copyDir(canonicalWorkspaceSource, workspaceDest); err != nil {
				log.Printf("WARN: bootstrap workspace: copy host %s -> %s failed (%v); falling back to embedded baseline", canonicalWorkspaceSource, workspaceDest, err)
				if extractErr := extractEmbeddedBaseline(workspaceDest); extractErr != nil {
					log.Printf("WARN: bootstrap workspace: embed extract also failed: %v", extractErr)
				}
			}
		default:
			if err := extractEmbeddedBaseline(workspaceDest); err != nil {
				log.Printf("WARN: bootstrap workspace: embed extract failed: %v", err)
			}
		}
	}

	// Write a minimal home/config.json with the placeholders the provisioner
	// substitutes (LITELLM_KEY, LITELLM_URL, TENANT_ID). Only write if absent
	// so an operator who pre-populated home/ keeps their version.
	configPath := filepath.Join(homeDir, "config.json")
	if _, err := os.Stat(configPath); errors.Is(err, os.ErrNotExist) {
		if err := writeBaselineConfig(configPath); err != nil {
			return fmt.Errorf("write baseline config: %w", err)
		}
	}

	ws := &store.Workspace{
		ID:                slug + "-" + randomHex(3),
		Name:              "Default Business",
		Slug:              slug,
		Description:       "Auto-bootstrapped default workspace. Edit via admin UI to customise the template Clara provisions new tenants from.",
		HostPath:          hostPath,
		IsDefaultAuto:     true,
		IsAvailableManual: true,
	}
	if err := h.Workspaces.Insert(ctx, ws); err != nil {
		return fmt.Errorf("insert workspace row: %w", err)
	}

	log.Printf("bootstrap: created default workspace id=%s slug=%s host=%s", ws.ID, ws.Slug, ws.HostPath)
	return nil
}

// writeBaselineConfig drops a minimal tenant config.json at path. The
// provisioner's SubstituteConfigPlaceholders pass replaces ${LITELLM_KEY},
// ${LITELLM_URL}, ${TENANT_ID} on first start.
func writeBaselineConfig(path string) error {
	baseline := map[string]any{
		"version":   3,
		"isolation": map[string]any{"enabled": false},
		"agents": map[string]any{
			"defaults": map[string]any{
				"workspace":  "/root/.picoclaw/workspace",
				"provider":   "litellm",
				"model_name": "default",
			},
		},
		"model_list": []map[string]any{
			{
				"model_name": "default",
				"provider":   "litellm",
				"model":      "gpt-4o-mini",
				"api_base":   "${LITELLM_URL}",
				"api_key":    "${LITELLM_KEY}",
				"enabled":    true,
			},
		},
		"channel_list": map[string]any{},
	}
	b, err := json.MarshalIndent(baseline, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

// isUsableDir returns true when path exists and is a directory the caller
// can walk into. Errors other than "missing" are logged at WARN and the
// caller decides whether to fall back.
func isUsableDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Printf("WARN: bootstrap workspace: stat %s: %v", path, err)
		}
		return false
	}
	return info.IsDir()
}

// extractEmbeddedBaseline writes the embedded baseline-workspace contents
// into dst, stripping the "baseline-workspace/" prefix and skipping the
// .gitkeep placeholders we only use to force go:embed to include empty
// directories. Idempotent over dst — destination is created if missing,
// existing files at the same path are overwritten.
func extractEmbeddedBaseline(dst string) error {
	const embedRoot = "baseline-workspace"
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dst, err)
	}
	return fs.WalkDir(baselineWorkspaceFS, embedRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == embedRoot {
			return nil
		}
		rel := strings.TrimPrefix(path, embedRoot+"/")
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if filepath.Base(rel) == ".gitkeep" {
			// Make sure the parent dir exists, but skip the placeholder file
			// itself — it's only needed to coax go:embed into shipping the
			// empty directory.
			return os.MkdirAll(filepath.Dir(target), 0o755)
		}
		data, err := baselineWorkspaceFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read embed %s: %w", path, err)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", filepath.Dir(target), err)
		}
		if err := os.WriteFile(target, data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", target, err)
		}
		return nil
	})
}

// copyDir recursively copies src into dst, preserving file modes. Used only
// during workspace bootstrap; not a general-purpose helper.
func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		s := filepath.Join(src, entry.Name())
		d := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(s, d); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(s, d); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
