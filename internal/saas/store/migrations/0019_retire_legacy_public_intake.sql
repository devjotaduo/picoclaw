-- Retire the legacy public intake schema. The public tenant flow now
-- starts inside an is_public=true tenant and uses Sofia over /pico/ws, with
-- Catarina following up over the institutional WhatsApp sidecar.

DROP INDEX IF EXISTS magic_links_active_by_intake_idx;
ALTER TABLE IF EXISTS magic_links DROP COLUMN IF EXISTS intake_id;

DROP INDEX IF EXISTS intake_reminders_due_idx;
DROP INDEX IF EXISTS intake_reminders_intake_idx;
DROP TABLE IF EXISTS intake_reminders;

DROP INDEX IF EXISTS company_intakes_qualified_at_idx;
DROP INDEX IF EXISTS idx_company_intakes_status_created;
DROP INDEX IF EXISTS idx_company_intakes_linked_tenant;
DROP TABLE IF EXISTS company_intakes;
