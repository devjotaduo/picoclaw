CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    bcrypt_hash   TEXT,
    status        TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('active', 'invited', 'disabled')),
    platform_role TEXT NOT NULL DEFAULT ''
                  CHECK (platform_role IN ('', 'platform_admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_platform_role ON users(platform_role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS tenant_memberships (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role       TEXT NOT NULL
               CHECK (role IN ('tenant_owner', 'tenant_admin', 'operator', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT UNIQUE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS invites (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    role          TEXT NOT NULL
                  CHECK (role IN ('tenant_owner', 'tenant_admin', 'operator', 'viewer')),
    token_hash    TEXT UNIQUE NOT NULL,
    invited_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    accepted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_tenant ON invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    tenant_id   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);

INSERT INTO users (email, bcrypt_hash, status, platform_role, created_at, last_login)
SELECT email, bcrypt_hash, 'active', 'platform_admin', created_at, last_login
FROM admins
ON CONFLICT (email) DO UPDATE
SET bcrypt_hash = COALESCE(users.bcrypt_hash, excluded.bcrypt_hash),
    status = 'active',
    platform_role = 'platform_admin',
    last_login = COALESCE(users.last_login, excluded.last_login);

INSERT INTO users (email, status)
SELECT DISTINCT lower(owner_email), 'invited'
FROM tenants
WHERE owner_email <> ''
ON CONFLICT (email) DO NOTHING;

INSERT INTO tenant_memberships (user_id, tenant_id, role)
SELECT u.id, t.id, 'tenant_owner'
FROM tenants t
JOIN users u ON u.email = lower(t.owner_email)
WHERE t.owner_email <> ''
ON CONFLICT (user_id, tenant_id) DO NOTHING;
