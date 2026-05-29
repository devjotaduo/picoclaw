-- Magic links table: operator-issued direct-access URLs for tenant access
-- without password.
--
-- Tracked here (instead of pure stateless HMAC tokens) so we can:
--   1. revoke individual links (set consumed_at manually)
--   2. attach a summary message rendered on consumed/revoked pages
--
-- The HMAC signature still gates access — the DB row is a side-channel
-- that lets us flip behaviour without trusting the client.

CREATE TABLE IF NOT EXISTS magic_links (
  nonce       TEXT        PRIMARY KEY,
  tenant_id   TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  summary     TEXT
);

-- Cleanup query support: drop expired-and-consumed rows in batches.
CREATE INDEX IF NOT EXISTS magic_links_expires_at_idx ON magic_links (expires_at);
