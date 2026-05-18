CREATE TABLE IF NOT EXISTS company_intakes (
  id TEXT PRIMARY KEY,
  resume_token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'report_ready', 'submitted', 'reviewed', 'linked')),
  company_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_whatsapp TEXT NOT NULL DEFAULT '',
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_transcript TEXT NOT NULL DEFAULT '',
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  crm_contact_id BIGINT,
  crm_company_id BIGINT,
  crm_deal_id BIGINT,
  source TEXT NOT NULL DEFAULT 'pre-cadastro',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_company_intakes_status_created
  ON company_intakes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_intakes_linked_tenant
  ON company_intakes (linked_tenant_id);
