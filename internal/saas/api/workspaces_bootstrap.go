package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

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

	// Seed home/workspace/ from the canonical source if it exists. The
	// controlplane container has /srv/picoclaw mounted read-only, so this
	// works in the live deployment but stays best-effort for local/test
	// environments where the path is absent.
	if info, err := os.Stat(canonicalWorkspaceSource); err == nil && info.IsDir() {
		dest := filepath.Join(homeDir, "workspace")
		if _, err := os.Stat(dest); errors.Is(err, os.ErrNotExist) {
			if err := copyDir(canonicalWorkspaceSource, dest); err != nil {
				log.Printf("WARN: bootstrap workspace: copy %s -> %s: %v", canonicalWorkspaceSource, dest, err)
				// Continue; an empty home/workspace/ is still better than no
				// workspace row at all.
			}
		}
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("WARN: bootstrap workspace: stat %s: %v", canonicalWorkspaceSource, err)
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
