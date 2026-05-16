package store_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// openTestDB opens and migrates a test database, skipping if TEST_DB_DSN is not set.
// Each test gets a unique schema to prevent cross-test pollution.
func openTestDB(t *testing.T) *store.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DB_DSN")
	if dsn == "" {
		t.Skip("TEST_DB_DSN not set; skipping store integration tests")
	}
	db, err := store.Open(context.Background(), dsn)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	if err := db.Migrate(context.Background()); err != nil {
		t.Fatalf("db.Migrate: %v", err)
	}
	t.Cleanup(db.Close)
	return db
}

// uniqueEmail generates a per-test email to avoid conflicts between parallel runs.
func uniqueEmail(t *testing.T, suffix string) string {
	return fmt.Sprintf("test-%s-%s@example.com", t.Name(), suffix)
}

// --- NormalizeEmail (pure, no DB) ---

func TestNormalizeEmail(t *testing.T) {
	cases := []struct{ in, want string }{
		{"user@Example.COM", "user@example.com"},
		{" alice@example.com ", "alice@example.com"},
		{"UPPER@DOMAIN.IO", "upper@domain.io"},
		{"already@lower.com", "already@lower.com"},
		{"  spaces  @test.com  ", "spaces  @test.com"}, // TrimSpace on outer
	}
	for _, tc := range cases {
		if got := store.NormalizeEmail(tc.in); got != tc.want {
			t.Errorf("NormalizeEmail(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// --- UserStore ---

func TestUserStore_CreatePlatformAdminAndFetch(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}

	email := uniqueEmail(t, "admin")
	u, err := users.CreatePlatformAdmin(ctx, email, "$2b$12$placeholder")
	if err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 {
		t.Fatal("want non-zero ID")
	}
	if u.Email != store.NormalizeEmail(email) {
		t.Errorf("Email = %q, want normalized form", u.Email)
	}
	if u.PlatformRole != store.RolePlatformAdmin {
		t.Errorf("PlatformRole = %q, want platform_admin", u.PlatformRole)
	}
	if u.Status != store.UserStatusActive {
		t.Errorf("Status = %q, want active", u.Status)
	}
	if !u.IsPlatformAdmin() {
		t.Error("IsPlatformAdmin() should be true")
	}

	// Bootstrap is idempotent: same ID, existing hash preserved.
	u2, err := users.CreatePlatformAdmin(ctx, email, "$2b$12$updated")
	if err != nil {
		t.Fatal(err)
	}
	if u2.ID != u.ID {
		t.Errorf("bootstrap changed user ID: %d → %d", u.ID, u2.ID)
	}
	if u2.BcryptHash == nil || *u2.BcryptHash != "$2b$12$placeholder" {
		t.Errorf("CreatePlatformAdmin replaced existing hash: got %v", u2.BcryptHash)
	}

	u3, err := users.ResetPlatformAdminPassword(ctx, email, "$2b$12$updated")
	if err != nil {
		t.Fatal(err)
	}
	if u3.ID != u.ID {
		t.Errorf("reset changed user ID: %d → %d", u.ID, u3.ID)
	}
	if u3.BcryptHash == nil || *u3.BcryptHash != "$2b$12$updated" {
		t.Errorf("ResetPlatformAdminPassword did not replace hash: got %v", u3.BcryptHash)
	}
}

func TestUserStore_GetByEmail(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}

	email := uniqueEmail(t, "fetch")
	created, err := users.CreatePlatformAdmin(ctx, email, "$2b$12$x")
	if err != nil {
		t.Fatal(err)
	}

	fetched, err := users.GetByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	if fetched.ID != created.ID {
		t.Errorf("GetByEmail returned wrong user")
	}

	// Case-insensitive lookup
	upper, err := users.GetByEmail(ctx, "UPPER+"+email)
	if err != store.ErrUserNotFound {
		t.Errorf("uppercase-only version should not exist, got user=%v err=%v", upper, err)
	}

	// Non-existent email
	_, err = users.GetByEmail(ctx, "nobody@example.com")
	if err != store.ErrUserNotFound {
		t.Errorf("want ErrUserNotFound, got %v", err)
	}
}

func TestUserStore_GetByID(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}

	email := uniqueEmail(t, "byid")
	created, _ := users.CreatePlatformAdmin(ctx, email, "$2b$12$x")

	byID, err := users.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if byID.Email != created.Email {
		t.Errorf("GetByID email mismatch: %q vs %q", byID.Email, created.Email)
	}

	_, err = users.GetByID(ctx, 999999999)
	if err != store.ErrUserNotFound {
		t.Errorf("want ErrUserNotFound for unknown ID, got %v", err)
	}
}

func TestUserStore_InviteAndActivate(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}

	email := uniqueEmail(t, "invite")
	invited, err := users.EnsureInvited(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	if invited.Status != store.UserStatusInvited {
		t.Errorf("EnsureInvited Status = %q, want invited", invited.Status)
	}

	// EnsureInvited is idempotent
	again, err := users.EnsureInvited(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != invited.ID {
		t.Error("EnsureInvited changed user ID on second call")
	}

	// Activate
	activated, err := users.Activate(ctx, email, "$2b$12$hash")
	if err != nil {
		t.Fatal(err)
	}
	if activated.Status != store.UserStatusActive {
		t.Errorf("Activate Status = %q, want active", activated.Status)
	}
	if activated.ID != invited.ID {
		t.Error("Activate changed user ID")
	}
}

// --- SessionStore ---

func TestSessionStore_CreateGetRevoke(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}
	sessions := &store.SessionStore{DB: db}

	u, err := users.CreatePlatformAdmin(ctx, uniqueEmail(t, "session"), "$2b$12$x")
	if err != nil {
		t.Fatal(err)
	}

	token, err := sessions.Create(ctx, u.ID, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("Create returned empty token")
	}

	// Two tokens must differ
	token2, err := sessions.Create(ctx, u.ID, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if token == token2 {
		t.Fatal("consecutive Create calls returned identical tokens")
	}

	// Valid token returns correct user
	got, err := sessions.GetUser(ctx, token)
	if err != nil {
		t.Fatalf("GetUser with valid token: %v", err)
	}
	if got.ID != u.ID {
		t.Errorf("GetUser returned user %d, want %d", got.ID, u.ID)
	}

	// Revoke
	if err := sessions.Revoke(ctx, token); err != nil {
		t.Fatal(err)
	}
	_, err = sessions.GetUser(ctx, token)
	if err != store.ErrSessionNotFound {
		t.Errorf("after Revoke: want ErrSessionNotFound, got %v", err)
	}
}

func TestSessionStore_UnknownToken(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	sessions := &store.SessionStore{DB: db}

	_, err := sessions.GetUser(ctx, "this-token-does-not-exist-at-all")
	if err != store.ErrSessionNotFound {
		t.Errorf("want ErrSessionNotFound, got %v", err)
	}
}

func TestSessionStore_EmptyToken(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	sessions := &store.SessionStore{DB: db}

	_, err := sessions.GetUser(ctx, "")
	if err != store.ErrSessionNotFound {
		t.Errorf("empty token: want ErrSessionNotFound, got %v", err)
	}
}

func TestSessionStore_ExpiredToken(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}
	sessions := &store.SessionStore{DB: db}

	u, _ := users.CreatePlatformAdmin(ctx, uniqueEmail(t, "expired"), "$2b$12$x")

	// TTL of -1 second → immediately expired
	token, err := sessions.Create(ctx, u.ID, -1*time.Second)
	if err != nil {
		t.Fatal(err)
	}

	_, err = sessions.GetUser(ctx, token)
	if err != store.ErrSessionNotFound {
		t.Errorf("expired token: want ErrSessionNotFound, got %v", err)
	}
}

// --- MembershipStore ---

func TestMembershipStore_UpsertAndGetRole(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	users := &store.UserStore{DB: db}
	memberships := &store.MembershipStore{DB: db}

	u, _ := users.EnsureInvited(ctx, uniqueEmail(t, "member"))
	tenantID := "tenant-" + t.Name()

	// Assign viewer role
	if err := memberships.Upsert(ctx, u.ID, tenantID, store.RoleViewer); err != nil {
		t.Fatal(err)
	}
	role, err := memberships.GetRole(ctx, u.ID, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	if role != store.RoleViewer {
		t.Errorf("GetRole = %q, want viewer", role)
	}

	// Upgrade role via upsert
	if err := memberships.Upsert(ctx, u.ID, tenantID, store.RoleTenantAdmin); err != nil {
		t.Fatal(err)
	}
	role, _ = memberships.GetRole(ctx, u.ID, tenantID)
	if role != store.RoleTenantAdmin {
		t.Errorf("after upgrade: GetRole = %q, want tenant_admin", role)
	}
}

func TestMembershipStore_NotFound(t *testing.T) {
	db := openTestDB(t)
	ctx := context.Background()
	memberships := &store.MembershipStore{DB: db}

	_, err := memberships.GetRole(ctx, 999999, "nonexistent-tenant-id")
	if err != store.ErrMembershipNotFound {
		t.Errorf("want ErrMembershipNotFound, got %v", err)
	}
}
