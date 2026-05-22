-- Shortlinks: a generic URL shortener served at <base>/s/<code>. Built
-- primarily to wrap Supabase magic links (which are 200+ chars with the
-- bearer-token query string baked in) into something usable on
-- WhatsApp/SMS, but kept domain-agnostic so any internal flow can use it.
--
-- Trade-offs:
--   - Codes are random 8-char base62 (~47 bits of entropy). Collisions
--     within the namespace are vanishingly improbable; if one ever
--     happens the INSERT fails on the unique constraint and the caller
--     retries with a fresh code. Cheaper than coordinating a counter.
--   - `target_url` stored verbatim — no validation here; the issuer is
--     responsible for not creating open-redirects to attacker-controlled
--     domains. Issuance is admin-only via /api/v1/shortlinks.
--   - `expires_at` is mandatory. There's no "forever" link; if the
--     operator wants long-lived behaviour they pick a far-future date.
--     Makes cleanup straightforward (DELETE WHERE expires_at < now()).
--   - `hits` is incremented on each resolve via UPDATE without locking.
--     The counter is best-effort visibility, not a guarantee — losing
--     a hit during a crashed transaction isn't worth row-level locking
--     for every click.

CREATE TABLE IF NOT EXISTS shortlinks (
  code         TEXT        PRIMARY KEY,
  target_url   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  -- created_by is the user ID of the platform admin that issued the link.
  -- Null when issued by a backend system flow (e.g. resend-credentials
  -- when the request originates from an automated path).
  created_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  -- Free-form label so the admin UI can show "magic link for tenant X"
  -- or "password-reset for owner Y" without parsing the target URL.
  label        TEXT        NOT NULL DEFAULT '',
  hits         INTEGER     NOT NULL DEFAULT 0,
  last_hit_at  TIMESTAMPTZ
);

-- Cleanup query support: DELETE expired rows in batches.
CREATE INDEX IF NOT EXISTS shortlinks_expires_at_idx ON shortlinks (expires_at);

-- Admin listing default order (newest first) without a sort step.
CREATE INDEX IF NOT EXISTS shortlinks_created_at_idx ON shortlinks (created_at DESC);
