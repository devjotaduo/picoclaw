-- workspace_mcp_servers — which MCP catalog entries are activated for each
-- workspace, plus the encrypted credentials. One row per (workspace, catalog
-- entry). Credentials are encrypted at-rest with PICOCLAW_SAAS_MCP_ENCRYPTION_KEY
-- (see internal/saas/mcp/credentials.go).
--
-- The catalog itself is hardcoded in internal/saas/mcp/catalog.go — no FK to
-- a catalog table, because there isn't one. `catalog_id` is validated at the
-- API layer against mcp.Lookup().

CREATE TABLE IF NOT EXISTS workspace_mcp_servers (
    workspace_id           TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    catalog_id             TEXT        NOT NULL,
    enabled                BOOLEAN     NOT NULL DEFAULT TRUE,
    credentials_encrypted  TEXT        NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, catalog_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_mcp_servers_workspace
    ON workspace_mcp_servers(workspace_id);
