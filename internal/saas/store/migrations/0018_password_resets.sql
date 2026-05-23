-- password_resets: one-shot tokens that let a platform_admin (or any
-- bcrypt-backed user in `users`) reset their dashboard password via the
-- public "Esqueci minha senha" flow.
--
-- Lifecycle:
--   1. POST /api/v1/auth/forgot-password { email } → server inserts a row
--      with a fresh random token + 1h expiry, mails the link.
--   2. User clicks the link, lands on /reset-password?token=...
--   3. POST /api/v1/auth/reset-password { token, password } → server
--      verifies the token (unconsumed + not expired), updates the user's
--      bcrypt hash, marks the row used_at=now() to make it one-shot.
--
-- The token is the URL-safe random component the user clicks, NOT a
-- hash of an email or anything user-derived — random rotation per
-- request, indexed for O(1) lookup, ON DELETE CASCADE on the user.

CREATE TABLE IF NOT EXISTS password_resets (
    token       TEXT        PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    ip          INET,
    user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user
    ON password_resets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_resets_expires
    ON password_resets (expires_at)
    WHERE used_at IS NULL;
