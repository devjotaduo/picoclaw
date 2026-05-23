import { api } from "./client";

// Shortlinks: admin-curated /s/<code> redirects. Used to wrap long magic
// links (and any other URLs the operator wants to share) into a tidy
// apex-scoped URL that survives WhatsApp/SMS auto-linkifiers and stays
// short enough to type. Server caps TTL at 365d and defaults to 30d.

export type Shortlink = {
  code: string;
  short_url: string;
  target_url: string;
  label: string;
  created_at: string;
  expires_at: string;
  hits: number;
  last_hit_at: string | null;
};

export type ShortlinkCreateInput = {
  target_url: string;
  label?: string;
  // Server defaults to 30d. Anything over 365d is silently capped.
  ttl_seconds?: number;
};

export type ShortlinkCreated = {
  code: string;
  short_url: string;
  target_url: string;
  label: string;
  expires_at: string;
};

export async function listShortlinks() {
  return api<{ shortlinks: Shortlink[] }>("/api/v1/shortlinks");
}

export async function createShortlink(input: ShortlinkCreateInput) {
  return api<ShortlinkCreated>("/api/v1/shortlinks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteShortlink(code: string) {
  return api<void>(`/api/v1/shortlinks/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}
