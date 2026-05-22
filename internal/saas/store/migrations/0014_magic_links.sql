-- Magic links table: operator-issued direct-access URLs that let a lead
-- click and land inside the tenant dashboard without password.
--
-- Tracked here (instead of pure stateless HMAC tokens) so we can:
--   1. mark a link "consumed" when the linked intake submits and show a
--      friendly thank-you page on subsequent clicks
--   2. attach a summary message rendered on the consumed page
--   3. revoke individual links (set consumed_at manually)
--
-- The HMAC signature still gates access — the DB row is a side-channel
-- that lets us flip behaviour without trusting the client.

CREATE TABLE IF NOT EXISTS magic_links (
  nonce       TEXT        PRIMARY KEY,
  tenant_id   TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_id   TEXT        REFERENCES company_intakes(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  summary     TEXT
);

-- Look up active (unconsumed) links for a tenant + intake quickly so the
-- onboarding-callback submit-intake handler can auto-invalidate them in
-- O(1) instead of scanning the table.
CREATE INDEX IF NOT EXISTS magic_links_active_by_intake_idx
  ON magic_links (tenant_id, intake_id)
  WHERE consumed_at IS NULL AND intake_id IS NOT NULL;

-- Cleanup query support: drop expired-and-consumed rows in batches.
CREATE INDEX IF NOT EXISTS magic_links_expires_at_idx ON magic_links (expires_at);
