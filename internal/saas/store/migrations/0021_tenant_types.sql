-- Tenant type catalog (v2.0): data-driven, vertical-aware tenant types that
-- replace the hardcoded publico/admin/cliente switch in
-- internal/saas/api/tenants.go::resolveUIProfile. Each type maps to an
-- existing ui-visibility profile (reuses that machinery), points at a seed
-- workspace, and carries a default agent roster + tier defaults so a tenant
-- can be born already configured for its vertical.
CREATE TABLE IF NOT EXISTS tenant_types (
    slug                 TEXT PRIMARY KEY,
    display_name         TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    icon                 TEXT NOT NULL DEFAULT '',
    -- category is the admin-facing family; ui_profile is the runtime
    -- ui-visibility active_profile (public/tenant/admin) it resolves to.
    category             TEXT NOT NULL DEFAULT 'cliente',
    ui_profile           TEXT NOT NULL DEFAULT 'tenant',
    -- seed workspace for this vertical; NULL falls back to the default-auto
    -- workspace at provision time.
    default_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    -- roster_json: ordered list of agent role specs to materialize, e.g.
    -- ["attendant","assistant"]. Empty/[] lets the provisioner fall back to
    -- the workspace's own roster.
    roster_json          TEXT NOT NULL DEFAULT '["attendant","assistant"]',
    -- defaults_json: lightweight tier defaults (budget, mem, cpu, channels,
    -- per-agent skills) pre-filled in the admin create wizard.
    defaults_json        TEXT NOT NULL DEFAULT '{}',
    is_system            BOOLEAN NOT NULL DEFAULT FALSE,
    is_selectable        BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order           INTEGER NOT NULL DEFAULT 100,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the three system types (so existing admin vocabulary keeps resolving)
-- plus the initial business verticals. ON CONFLICT keeps this idempotent;
-- the migration runner has no down-migrations.
INSERT INTO tenant_types
    (slug, display_name, description, icon, category, ui_profile, roster_json, is_system, is_selectable, sort_order)
VALUES
    ('publico', 'Público (discovery)', 'Tenant anônimo de descoberta com Sofia/Catarina.', 'globe', 'publico', 'public', '[]', TRUE, TRUE, 10),
    ('admin', 'Administração', 'Painel de administração da plataforma.', 'shield', 'admin', 'admin', '[]', TRUE, FALSE, 20),
    ('cliente', 'Cliente (genérico)', 'Tenant de cliente padrão, sem vertical específico.', 'briefcase', 'cliente', 'tenant', '["attendant","assistant"]', TRUE, TRUE, 30),
    ('atendimento-geral', 'Atendimento Geral', 'Atendente generalista para qualquer negócio.', 'headset', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 100),
    ('clinica', 'Clínica / Saúde', 'Agendamento, triagem e dúvidas para clínicas e consultórios.', 'stethoscope', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 110),
    ('loja', 'Loja / E-commerce', 'Vendas, catálogo e suporte para lojas e e-commerce.', 'shopping-cart', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 120),
    ('restaurante', 'Restaurante / Delivery', 'Pedidos, cardápio, reservas e delivery.', 'utensils', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 130),
    ('imobiliaria', 'Imobiliária', 'Captação, agendamento de visitas e qualificação de leads.', 'home', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 140),
    ('servicos', 'Serviços / Profissional', 'Agendamento e atendimento para prestadores de serviço.', 'calendar', 'cliente', 'tenant', '["attendant","assistant"]', FALSE, TRUE, 150)
ON CONFLICT (slug) DO NOTHING;
