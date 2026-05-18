import type {
  Access,
  LauncherPolicyCatalog,
  RolePolicy,
} from "@/api/launcher-profiles";

export const accessOrder: Access[] = ["none", "read", "write"];

export const accessLabels: Record<Access, string> = {
  none: "Nenhum",
  read: "Leitura",
  write: "Escrita",
};

export const rolePresets = [
  { id: "full", label: "Admin completo" },
  { id: "operator", label: "Operador WhatsApp" },
  { id: "reader", label: "Leitor" },
  { id: "none", label: "Sem acesso" },
] as const;

export type RolePresetID = (typeof rolePresets)[number]["id"];

export function formatRolePolicy(policy: RolePolicy | undefined): string {
  return JSON.stringify(policy ?? {}, null, 2);
}

export function parseRolePolicyText(
  text: string,
  catalog: LauncherPolicyCatalog,
): { policy: RolePolicy | null; error: string | null } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRolePolicyShape(parsed)) {
      return {
        policy: null,
        error:
          'Role policy must be an object: { role: { resource: "none" | "read" | "write" } }.',
      };
    }
    return { policy: normalizeRolePolicy(parsed, catalog), error: null };
  } catch (err) {
    return {
      policy: null,
      error: err instanceof Error ? err.message : "Invalid JSON.",
    };
  }
}

export function normalizeRolePolicy(
  policy: RolePolicy | undefined,
  catalog: LauncherPolicyCatalog,
): RolePolicy {
  const next = clonePolicy(catalog.default_role_policy);
  const explicit: Record<string, Record<string, boolean>> = {};
  const featureIDs = new Set(catalog.features.map((feature) => feature.id));

  for (const [role, features] of Object.entries(policy ?? {})) {
    if (!next[role]) next[role] = {};
    if (!explicit[role]) explicit[role] = {};
    for (const [feature, access] of Object.entries(features ?? {})) {
      if (!featureIDs.has(feature) || !isAccess(access)) continue;
      next[role][feature] = access;
      explicit[role][feature] = true;
    }
  }

  for (const role of Object.keys(next)) {
    const roleExplicit = explicit[role] ?? {};
    for (const feature of catalog.features) {
      if (roleExplicit[feature.id]) continue;
      if (feature.fallback && roleExplicit[feature.fallback]) {
        next[role][feature.id] = next[role][feature.fallback] ?? "none";
        continue;
      }
      if (!next[role][feature.id]) {
        next[role][feature.id] = "none";
      }
    }
  }

  return next;
}

export function setRoleAccess(
  policy: RolePolicy,
  roleID: string,
  featureID: string,
  access: Access,
): RolePolicy {
  return {
    ...policy,
    [roleID]: {
      ...(policy[roleID] ?? {}),
      [featureID]: access,
    },
  };
}

export function setFeatureAccessForAllRoles(
  policy: RolePolicy,
  catalog: LauncherPolicyCatalog,
  featureID: string,
  access: Access,
): RolePolicy {
  const next = clonePolicy(policy);
  for (const role of catalog.roles) {
    next[role.id] = {
      ...(next[role.id] ?? {}),
      [featureID]: access,
    };
  }
  return next;
}

export function applyRolePreset(
  policy: RolePolicy,
  catalog: LauncherPolicyCatalog,
  roleID: string,
  presetID: RolePresetID,
): RolePolicy {
  return {
    ...policy,
    [roleID]: policyForPreset(catalog, presetID),
  };
}

function policyForPreset(
  catalog: LauncherPolicyCatalog,
  presetID: RolePresetID,
): Record<string, Access> {
  const access =
    presetID === "full" ? "write" : presetID === "reader" ? "read" : "none";
  const next = Object.fromEntries(
    catalog.features.map((feature) => [feature.id, access]),
  ) as Record<string, Access>;

  if (presetID === "operator") {
    next.chat = "write";
    next.whatsapp_inbox = "write";
    next.whatsapp_reports = "read";
    next.logs = "read";
  }

  return next;
}

function clonePolicy(policy: RolePolicy | undefined): RolePolicy {
  return Object.fromEntries(
    Object.entries(policy ?? {}).map(([role, features]) => [
      role,
      { ...(features ?? {}) },
    ]),
  ) as RolePolicy;
}

function isRolePolicyShape(value: unknown): value is RolePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const features of Object.values(value)) {
    if (!features || typeof features !== "object" || Array.isArray(features)) {
      return false;
    }
    for (const access of Object.values(features)) {
      if (!isAccess(access)) return false;
    }
  }
  return true;
}

function isAccess(value: unknown): value is Access {
  return value === "none" || value === "read" || value === "write";
}
