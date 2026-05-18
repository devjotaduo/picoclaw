-- Add conversational chat fields to company_intakes for the Clara IA agent flow.
--
-- chat_messages stores the full LLM message history (role + content + tool calls)
--   so a session can be resumed from any device that has the resume token.
-- qualified_at is set when the agent calls the `mark_qualified` tool, signaling
--   the intake has enough information to generate a proposal and create a tenant.

ALTER TABLE company_intakes
  ADD COLUMN IF NOT EXISTS chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualified_at  TIMESTAMPTZ NULL;

-- Partial index speeds up the admin view that lists qualified-but-not-submitted
-- intakes (the leads worth following up on).
CREATE INDEX IF NOT EXISTS company_intakes_qualified_at_idx
  ON company_intakes (qualified_at)
  WHERE qualified_at IS NOT NULL;
