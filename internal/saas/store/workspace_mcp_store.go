package store

import (
	"context"
	"time"
)

// WorkspaceMCPServer mirrors one row of the workspace_mcp_servers table —
// a single MCP catalog entry activated for a workspace, with credentials
// encrypted at-rest by the SaaS controlplane (see
// internal/saas/mcp/credentials.go). The catalog itself lives in
// internal/saas/mcp/catalog.go; CatalogID is validated at the API layer
// against mcp.Lookup() since there is no DB-side catalog table.
type WorkspaceMCPServer struct {
	WorkspaceID          string
	CatalogID            string
	Enabled              bool
	CredentialsEncrypted string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// WorkspaceMCPStore is the CRUD layer for workspace_mcp_servers. It mirrors
// the conventions of WorkspaceStore: pgxpool-backed, no per-call tx unless
// needed, errors bubble up unwrapped.
type WorkspaceMCPStore struct{ DB *DB }

const workspaceMCPCols = `workspace_id, catalog_id, enabled, credentials_encrypted, created_at, updated_at`

// Upsert inserts a new activation row or, if one already exists for the
// (workspace_id, catalog_id) composite key, overwrites enabled and
// credentials_encrypted and bumps updated_at. Callers re-encrypt credentials
// at the API layer before calling here.
func (s *WorkspaceMCPStore) Upsert(ctx context.Context, row *WorkspaceMCPServer) error {
	const q = `
        INSERT INTO workspace_mcp_servers
            (workspace_id, catalog_id, enabled, credentials_encrypted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, now(), now())
        ON CONFLICT (workspace_id, catalog_id) DO UPDATE
        SET enabled               = EXCLUDED.enabled,
            credentials_encrypted = EXCLUDED.credentials_encrypted,
            updated_at            = now()`
	_, err := s.DB.Pool.Exec(ctx, q,
		row.WorkspaceID, row.CatalogID, row.Enabled, row.CredentialsEncrypted,
	)
	return err
}

// ListForWorkspace returns every activated MCP server for the given
// workspace, sorted by catalog_id for stable rendering in the admin UI.
// A workspace with no activations returns an empty (non-nil) slice plus a
// nil error.
func (s *WorkspaceMCPStore) ListForWorkspace(ctx context.Context, workspaceID string) ([]WorkspaceMCPServer, error) {
	const q = `SELECT ` + workspaceMCPCols + `
        FROM workspace_mcp_servers
        WHERE workspace_id = $1
        ORDER BY catalog_id`
	rows, err := s.DB.Pool.Query(ctx, q, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]WorkspaceMCPServer, 0)
	for rows.Next() {
		var r WorkspaceMCPServer
		if err := rows.Scan(
			&r.WorkspaceID, &r.CatalogID, &r.Enabled, &r.CredentialsEncrypted,
			&r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Delete removes a single activation row. Deleting a non-existent row is a
// silent no-op — callers that need 404-on-missing should check existence
// separately (the HTTP layer in Task 7 will).
func (s *WorkspaceMCPStore) Delete(ctx context.Context, workspaceID, catalogID string) error {
	const q = `DELETE FROM workspace_mcp_servers WHERE workspace_id = $1 AND catalog_id = $2`
	_, err := s.DB.Pool.Exec(ctx, q, workspaceID, catalogID)
	return err
}
