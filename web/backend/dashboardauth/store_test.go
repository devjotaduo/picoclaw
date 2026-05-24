//go:build !mipsle && !netbsd && !(freebsd && arm)

package dashboardauth

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func TestStoreVerifyLoginWithOwnerEmail(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	if err := store.SetCredentials(ctx, " Owner@Example.COM ", "dashboard-password"); err != nil {
		t.Fatalf("SetCredentials() error = %v", err)
	}

	ok, err := store.VerifyLogin(ctx, "owner@example.com", "dashboard-password")
	if err != nil {
		t.Fatalf("VerifyLogin(correct) error = %v", err)
	}
	if !ok {
		t.Fatal("VerifyLogin(correct) = false, want true")
	}
	ok, err = store.VerifyLogin(ctx, "other@example.com", "dashboard-password")
	if err != nil {
		t.Fatalf("VerifyLogin(wrong email) error = %v", err)
	}
	if ok {
		t.Fatal("VerifyLogin(wrong email) = true, want false")
	}
}

func TestOpenMigratesLegacyPasswordOnlyStore(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, DBFilename)
	hash, err := bcrypt.GenerateFromPassword([]byte("legacy-password"), bcryptCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}

	db, err := sql.Open(sqliteDriver, dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE dashboard_credentials (
			id          INTEGER PRIMARY KEY CHECK (id = 1),
			bcrypt_hash TEXT    NOT NULL
		)`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO dashboard_credentials (id, bcrypt_hash) VALUES (1, ?)`, string(hash)); err != nil {
		t.Fatalf("insert legacy hash: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close legacy db: %v", err)
	}

	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	ok, err := store.VerifyLogin(context.Background(), "anyone@example.com", "legacy-password")
	if err != nil {
		t.Fatalf("VerifyLogin(legacy) error = %v", err)
	}
	if !ok {
		t.Fatal("VerifyLogin(legacy) = false, want true")
	}
}
