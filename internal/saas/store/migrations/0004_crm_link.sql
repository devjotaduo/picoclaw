-- Link picoclaw-saas tenants to records inside the embedded open-crm. Nullable
-- because the CRM link is best-effort during tenant creation.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_contact_id BIGINT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_company_id BIGINT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_deal_id    BIGINT;
