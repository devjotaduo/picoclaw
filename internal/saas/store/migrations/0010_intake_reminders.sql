-- Onboarding reminder queue. When AutoProvisioner.Run succeeds, it schedules
-- three rows here (T+24h, T+72h, T+7d). A background worker in the
-- controlplane fans them out via the existing mailer. Reminders are cancelled
-- the first time the owner authenticates via Supabase (tenant_gateway hook),
-- so engaged visitors don't get nagged.

CREATE TABLE IF NOT EXISTS intake_reminders (
  id BIGSERIAL PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES company_intakes(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  template TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index: the worker only ever scans rows that are still pending and
-- past their scheduled time. Keeps the index tiny in a system where most
-- rows are either sent or cancelled.
CREATE INDEX IF NOT EXISTS intake_reminders_due_idx
  ON intake_reminders (scheduled_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS intake_reminders_intake_idx
  ON intake_reminders (intake_id);
