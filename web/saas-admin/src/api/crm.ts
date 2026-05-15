import { api } from "./client";

export type CRMContact = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_id: number | null;
  title: string;
  status: string;
  company_name: string | null;
  company_domain: string | null;
  created_at: string;
  updated_at: string;
};

export type CRMDeal = {
  id: number;
  name: string;
  contact_id: number | null;
  value: number;
  stage: string;
  close_date: string;
  notes: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  created_at: string;
  updated_at: string;
};

export const STAGE_LABEL: Record<string, string> = {
  prospect:    "Prospect",
  qualified:   "Qualified",
  proposal:    "Proposal",
  negotiation: "Negotiation",
  won:         "Won",
  lost:        "Lost",
};

export const STAGE_COLOR: Record<string, string> = {
  prospect:    "text-zinc-400",
  qualified:   "text-blue-400",
  proposal:    "text-amber-400",
  negotiation: "text-orange-400",
  won:         "text-emerald-400",
  lost:        "text-red-400",
};

export async function getCRMContact(id: number) {
  return api<{ contact: CRMContact }>(`/crm/api/contacts/${id}`);
}

export async function createCRMContact(data: {
  first_name: string;
  last_name?: string;
  email?: string;
}) {
  return api<{ contact: CRMContact }>("/crm/api/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listContactDeals(contactId: number) {
  return api<{ deals: CRMDeal[]; total: number; totalValue: number }>(
    `/crm/api/deals?contact_id=${contactId}&limit=10&order=desc`,
  );
}

export async function createCRMDeal(data: {
  name: string;
  contact_id: number;
  value?: number;
  stage?: string;
  close_date?: string;
  notes?: string;
}) {
  return api<{ deal: CRMDeal }>("/crm/api/deals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
