import { api } from "./client";

export type ClaudeCLIAuthStatus = {
  dir_configured: boolean;
  configured: boolean;
  token_preview?: string;
  updated_at?: string;
};

export async function getClaudeCLIAuth() {
  return api<ClaudeCLIAuthStatus>("/api/v1/platform/cli-auth/claude");
}

export async function updateClaudeCLIAuth(token: string) {
  return api<ClaudeCLIAuthStatus>("/api/v1/platform/cli-auth/claude", {
    method: "PUT",
    body: JSON.stringify({ token }),
  });
}
