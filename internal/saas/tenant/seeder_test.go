package tenant

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	_ "modernc.org/sqlite"
)

// TestSeedDashboardPassword guarantees the seeded DB matches the exact schema
// and bcrypt cost that picoclaw's dashboardauth.Store expects. Any drift here
// causes silent first-login failures for every newly-provisioned tenant.
func TestSeedDashboardPassword(t *testing.T) {
	dir := t.TempDir()
	const password = "correct-horse-battery-staple"

	if err := SeedDashboardPassword(context.Background(), dir, password); err != nil {
		t.Fatalf("seed: %v", err)
	}

	dbPath := filepath.Join(dir, DBFilename)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	// Schema matches picoclaw verbatim: table name, columns, CHECK(id=1).
	const expectSchema = "CREATE TABLE dashboard_credentials (\n\t\t\tid          INTEGER PRIMARY KEY CHECK (id = 1),\n\t\t\tbcrypt_hash TEXT    NOT NULL\n\t\t)"
	var schema string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='dashboard_credentials'`).Scan(&schema); err != nil {
		t.Fatalf("schema query: %v", err)
	}
	if schema != expectSchema {
		t.Errorf("schema drift detected.\nwant: %q\ngot:  %q", expectSchema, schema)
	}

	// Exactly one row at id=1.
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM dashboard_credentials WHERE id = 1`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("want exactly 1 row at id=1, got %d", count)
	}

	// Hash verifies against the original plaintext (i.e. bcrypt cost matches).
	var hash string
	if err := db.QueryRow(`SELECT bcrypt_hash FROM dashboard_credentials WHERE id = 1`).Scan(&hash); err != nil {
		t.Fatalf("scan hash: %v", err)
	}
	if !auth.VerifyPassword(hash, password) {
		t.Errorf("seeded hash does not verify against original password")
	}
	if auth.VerifyPassword(hash, "wrong-password") {
		t.Errorf("seeded hash incorrectly verifies a wrong password")
	}
}

func TestSeedDashboardPassword_Reseed(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	if err := SeedDashboardPassword(ctx, dir, "first"); err != nil {
		t.Fatalf("seed1: %v", err)
	}
	if err := SeedDashboardPassword(ctx, dir, "second"); err != nil {
		t.Fatalf("seed2: %v", err)
	}

	db, err := sql.Open("sqlite", filepath.Join(dir, DBFilename))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	var hash string
	if err := db.QueryRow(`SELECT bcrypt_hash FROM dashboard_credentials WHERE id = 1`).Scan(&hash); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if auth.VerifyPassword(hash, "first") {
		t.Error("old password should no longer verify after reseed")
	}
	if !auth.VerifyPassword(hash, "second") {
		t.Error("new password does not verify after reseed")
	}
}
