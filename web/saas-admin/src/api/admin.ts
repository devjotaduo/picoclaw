import { api } from "./client";

export type Me = {
  id: number;
  email: string;
  status: "active" | "invited" | "disabled";
  platform_role: "" | "platform_admin";
  memberships: Array<{ tenant_id: string; role: "tenant_owner" | "tenant_admin" | "operator" | "viewer" }>;
  capabilities: string[];
  created_at: string;
  last_login: string | null;
};

export async function login(email: string, password: string) {
  return api<{ email: string }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return api<void>("/api/v1/auth/logout", { method: "POST" });
}

export async function getMe() {
  return api<Me>("/api/v1/auth/me");
}

export async function acceptInvite(token: string, password: string) {
  return api<{ email: string; tenant_id: string; role: string }>("/api/v1/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return api<void>("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}
