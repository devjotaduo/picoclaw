package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestWorkspaceMCPUpsertAndList(t *testing.T) {
	db := openTestDB(t)
	wsStore := &store.WorkspaceStore{DB: db}
	mcpStore := &store.WorkspaceMCPStore{DB: db}
	ctx := context.Background()

	wsID := fmt.Sprintf("mcp-upsert-%d", time.Now().UnixNano())
	ws := &store.Workspace{
		ID: wsID, Name: "Test", Slug: wsID, HostPath: "/tmp/" + wsID,
		RolePolicyJSON: []byte("{}"),
	}
	if err := wsStore.Insert(ctx, ws); err != nil {
		t.Fatal(err)
	}

	row := &store.WorkspaceMCPServer{
		WorkspaceID:          wsID,
		CatalogID:            "notion",
		Enabled:              true,
		CredentialsEncrypted: "ciphertext-1",
	}
	if err := mcpStore.Upsert(ctx, row); err != nil {
		t.Fatal(err)
	}

	list, err := mcpStore.ListForWorkspace(ctx, wsID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d, want 1", len(list))
	}
	if list[0].CatalogID != "notion" || list[0].CredentialsEncrypted != "ciphertext-1" {
		t.Errorf("bad row: %+v", list[0])
	}
	if !list[0].Enabled {
		t.Errorf("expected enabled=true, got %+v", list[0])
	}

	// Upsert again with new ciphertext — should overwrite.
	row.CredentialsEncrypted = "ciphertext-2"
	row.Enabled = false
	if err := mcpStore.Upsert(ctx, row); err != nil {
		t.Fatal(err)
	}
	list, err = mcpStore.ListForWorkspace(ctx, wsID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("after upsert: got %d rows, want 1", len(list))
	}
	if list[0].CredentialsEncrypted != "ciphertext-2" || list[0].Enabled {
		t.Errorf("upsert didn't overwrite: %+v", list[0])
	}
}

func TestWorkspaceMCPDelete(t *testing.T) {
	db := openTestDB(t)
	wsStore := &store.WorkspaceStore{DB: db}
	mcpStore := &store.WorkspaceMCPStore{DB: db}
	ctx := context.Background()

	wsID := fmt.Sprintf("mcp-delete-%d", time.Now().UnixNano())
	if err := wsStore.Insert(ctx, &store.Workspace{
		ID: wsID, Name: "T", Slug: wsID, HostPath: "/tmp/" + wsID,
		RolePolicyJSON: []byte("{}"),
	}); err != nil {
		t.Fatal(err)
	}
	if err := mcpStore.Upsert(ctx, &store.WorkspaceMCPServer{
		WorkspaceID: wsID, CatalogID: "notion", Enabled: true,
	}); err != nil {
		t.Fatal(err)
	}

	if err := mcpStore.Delete(ctx, wsID, "notion"); err != nil {
		t.Fatal(err)
	}
	list, err := mcpStore.ListForWorkspace(ctx, wsID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Errorf("expected empty list, got %+v", list)
	}
}

func TestWorkspaceMCPCascadeOnWorkspaceDelete(t *testing.T) {
	db := openTestDB(t)
	wsStore := &store.WorkspaceStore{DB: db}
	mcpStore := &store.WorkspaceMCPStore{DB: db}
	ctx := context.Background()

	wsID := fmt.Sprintf("mcp-cascade-%d", time.Now().UnixNano())
	if err := wsStore.Insert(ctx, &store.Workspace{
		ID: wsID, Name: "T", Slug: wsID, HostPath: "/tmp/" + wsID,
		RolePolicyJSON: []byte("{}"), IsAvailableManual: true,
	}); err != nil {
		t.Fatal(err)
	}
	if err := mcpStore.Upsert(ctx, &store.WorkspaceMCPServer{
		WorkspaceID: wsID, CatalogID: "notion",
	}); err != nil {
		t.Fatal(err)
	}

	if err := wsStore.Delete(ctx, wsID); err != nil {
		t.Fatal(err)
	}

	list, err := mcpStore.ListForWorkspace(ctx, wsID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Errorf("FK cascade should have cleaned up; got %+v", list)
	}
}
