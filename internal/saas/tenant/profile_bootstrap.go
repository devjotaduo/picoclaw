package tenant

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const defaultLauncherProfileID = "default-business"

// EnsureDefaultLauncherProfile guarantees the SaaS has a reusable default
// launcher profile. This keeps fresh installs production-ready: new tenants get
// the centrally managed seed immediately, without requiring a first manual
// import in the admin UI.
func EnsureDefaultLauncherProfile(ctx context.Context, cfg *config.Config, profiles *store.LauncherProfileStore) error {
	if cfg == nil || profiles == nil {
		return nil
	}
	if existing, err := profiles.GetDefault(ctx); err == nil {
		if existing.ID != defaultLauncherProfileID {
			return nil
		}
		changed, normalizeErr := NormalizeDefaultLauncherProfileSeed(existing.SeedPath)
		if normalizeErr != nil {
			return fmt.Errorf("normalize default launcher profile: %w", normalizeErr)
		}
		if changed {
			return profiles.Update(ctx, existing)
		}
		return nil
	} else if !errors.Is(err, store.ErrLauncherProfileNotFound) {
		return err
	}

	seedPath := filepath.Join(cfg.TenantProfileDir, defaultLauncherProfileID, "seed")
	if err := InitializeDefaultLauncherProfileSeed(cfg.TenantTemplateDir, seedPath); err != nil {
		return fmt.Errorf("bootstrap default launcher profile: %w", err)
	}

	rolePolicyJSON, err := store.MarshalRolePolicy(policy.DefaultRolePolicy())
	if err != nil {
		return err
	}
	profile := &store.LauncherProfile{
		ID:             defaultLauncherProfileID,
		Name:           "Default Business",
		Slug:           "default-business",
		Description:    "Default sanitized PicoClaw launcher seed for business tenants.",
		IsDefault:      true,
		Version:        1,
		SeedPath:       seedPath,
		RolePolicyJSON: rolePolicyJSON,
	}
	if err := profiles.Insert(ctx, profile); err != nil {
		existing, getErr := profiles.Get(ctx, defaultLauncherProfileID)
		if getErr != nil {
			return err
		}
		if existing.SeedPath == "" {
			existing.SeedPath = seedPath
		}
		if _, normalizeErr := NormalizeDefaultLauncherProfileSeed(existing.SeedPath); normalizeErr != nil {
			return fmt.Errorf("normalize default launcher profile: %w", normalizeErr)
		}
		existing.IsDefault = true
		if existing.RolePolicyJSON == nil {
			existing.RolePolicyJSON = rolePolicyJSON
		}
		return profiles.Update(ctx, existing)
	}
	return nil
}
