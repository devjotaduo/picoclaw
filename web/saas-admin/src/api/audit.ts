import { api } from "./client";

export type AuditEntry = {
  id: number;
  actor_email: string | null;
  tenant_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};

export async function getAuditLog(limit = 100) {
  return api<{ audit: AuditEntry[] }>(`/api/v1/audit?limit=${limit}`);
}
