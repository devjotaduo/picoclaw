import type { WorkspaceSyncStatusValue } from "@/api/workspaces";

export function workspaceSyncLabel(status?: WorkspaceSyncStatusValue | null) {
  switch (status) {
    case "synced":
      return "Git OK";
    case "diverged":
      return "Divergente";
    case "unknown":
    default:
      return "Desconhecido";
  }
}

export function workspaceSyncBadgeClass(status?: WorkspaceSyncStatusValue | null) {
  switch (status) {
    case "synced":
      return "border-emerald-700 bg-emerald-950/30 text-emerald-300";
    case "diverged":
      return "border-amber-700 bg-amber-950/30 text-amber-300";
    case "unknown":
    default:
      return "border-zinc-700 bg-zinc-950 text-zinc-400";
  }
}

export function shortWorkspaceHash(hash?: string | null) {
  if (!hash) return "indisponivel";
  return hash.length <= 16 ? hash : hash.slice(0, 12);
}
