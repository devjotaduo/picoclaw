import { api } from "./client";

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
  return api<PlatformStats>("/api/v1/platform/stats");
}

export async function getPlatformTimeseries(days = 30): Promise<{ points: TimeseriesPoint[] }> {
  return api<{ points: TimeseriesPoint[] }>(`/api/v1/platform/usage-timeseries?days=${days}`);
}

export async function listUsers(): Promise<{ users: PlatformUser[] }> {
  return api<{ users: PlatformUser[] }>("/api/v1/users");
}

export async function invitePlatformAdmin(
  email: string,
): Promise<{ token: string; email: string; expires_at: string }> {
  return api<{ token: string; email: string; expires_at: string }>("/api/v1/platform/invite-admin", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
