const BASE = "/api/v1";

export interface PlatformStats {
  active_tenants: number;
  suspended_tenants: number;
  error_tenants: number;
  total_cost_usd: number;
  total_tokens: number;
}

export interface TimeseriesPoint {
  day: string;
  cost_usd: number;
  tokens: number;
}

export interface PlatformUser {
  id: number;
  email: string;
  status: string;
  platform_role: string;
  created_at: string;
  last_login: string | null;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const res = await fetch(`${BASE}/platform/stats`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPlatformTimeseries(days = 30): Promise<{ points: TimeseriesPoint[] }> {
  const res = await fetch(`${BASE}/platform/usage-timeseries?days=${days}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listUsers(): Promise<{ users: PlatformUser[] }> {
  const res = await fetch(`${BASE}/users`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function invitePlatformAdmin(
  email: string,
): Promise<{ token: string; email: string; expires_at: string }> {
  const res = await fetch(`${BASE}/platform/invite-admin`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
