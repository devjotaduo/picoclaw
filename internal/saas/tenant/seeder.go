package tenant

// Seeder pre-populates the picoclaw launcher dashboard auth SQLite database
// before the tenant container starts, so the tenant never sees the public
// /launcher-setup screen.
//
// The schema and bcrypt cost MUST match
//
//	picoclaw/web/backend/dashboardauth/sql.go
//	picoclaw/web/backend/dashboardauth/store.go
//
// exactly. Any drift breaks first-login.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/policy"
	_ "modernc.org/sqlite"
)

// DBFilename mirrors picoclaw's dashboardauth.DBFilename.
const DBFilename = "launcher-auth.db"

const (
	sqlCreateTable = `
		CREATE TABLE IF NOT EXISTS dashboard_credentials (
			id          INTEGER PRIMARY KEY CHECK (id = 1),
			owner_email TEXT    NOT NULL DEFAULT '',
			bcrypt_hash TEXT    NOT NULL
		)`

	sqlUpsertCredentials = `
		INSERT INTO dashboard_credentials (id, owner_email, bcrypt_hash) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET owner_email = excluded.owner_email, bcrypt_hash = excluded.bcrypt_hash`
)

// SeedDashboardPassword creates (or rewrites) the launcher-auth.db inside
// volumeDir and stores a bcrypt(password) hash. The bcrypt cost is fixed at
// auth.BcryptCost to match picoclaw exactly.
func SeedDashboardPassword(ctx context.Context, volumeDir, password string) error {
	return SeedDashboardCredentials(ctx, volumeDir, "", password)
}

// SeedDashboardCredentials creates (or rewrites) the launcher-auth.db inside
// volumeDir and stores owner email + bcrypt(password). The launcher validates
// both when owner_email is present.
func SeedDashboardCredentials(ctx context.Context, volumeDir, ownerEmail, password string) error {
	if password == "" {
		return fmt.Errorf("empty password")
	}
	if err := os.MkdirAll(volumeDir, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("bcrypt: %w", err)
	}
	dbPath := filepath.Join(volumeDir, DBFilename)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, sqlCreateTable); err != nil {
		return fmt.Errorf("create table: %w", err)
	}
	if _, err := db.ExecContext(ctx, sqlUpsertCredentials, normalizeEmail(ownerEmail), hash); err != nil {
		return fmt.Errorf("upsert hash: %w", err)
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

// UIVisibilityProfile is the enum of named visibility presets baked into the
// workspace's ui-visibility.json. The frontend's resolveUIVisibilityProfile
// picks active_profile first, so this is what the admin choice ("público /
// admin / cliente") translates to at provisioning time.
type UIVisibilityProfile string

const (
	UIProfilePublic  UIVisibilityProfile = "public"
	UIProfileTenant  UIVisibilityProfile = "tenant"
	UIProfileAdmin   UIVisibilityProfile = "admin"
	UIProfileWaiting UIVisibilityProfile = "waiting"
)

// SetUIVisibilityActiveProfile rewrites ui-visibility.json in the tenant
// volume with active_profile=profile. Idempotent. No-op (returns nil) if the
// file doesn't exist — workspaces without ui-visibility.json just inherit the
// frontend's DEFAULT_UI_VISIBILITY_POLICY at runtime, so we don't force a
// scaffold here.
func SetUIVisibilityActiveProfile(volumeDir string, profile UIVisibilityProfile) error {
	if profile == "" {
		return nil
	}
	path := filepath.Join(volumeDir, "ui-visibility.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read ui-visibility: %w", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return fmt.Errorf("parse ui-visibility: %w", err)
	}
	doc["active_profile"] = string(profile)
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal ui-visibility: %w", err)
	}
	if err := os.WriteFile(path, out, 0o600); err != nil {
		return fmt.Errorf("write ui-visibility: %w", err)
	}
	return nil
}

// WriteLauncherPolicy writes launcher_policy.json into the tenant volume so
// the launcher inside the container reads the same RBAC matrix the
// controlplane uses to gate dashboard requests. The policy is the JSON form
// of policy.RolePolicy already normalized by store.WorkspaceStore.
//
// Called by runProvision (workspace path) and runProvisionClone (after the
// raw-copy refreshes the source's stale file). Nil rolePolicy is treated as
// the default policy.
func WriteLauncherPolicy(volumeDir string, rolePolicy policy.RolePolicy) error {
	if err := os.MkdirAll(volumeDir, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	rp := policy.NormalizeRolePolicy(rolePolicy)
	data, err := json.MarshalIndent(rp, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal policy: %w", err)
	}
	return os.WriteFile(filepath.Join(volumeDir, "launcher_policy.json"), data, 0o644)
}
