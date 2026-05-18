import { useMemo } from "react";

import {
  type Access,
  type LauncherPolicyCatalog,
  type RolePolicy,
} from "@/api/launcher-profiles";
import { SectionCard } from "@/components/launcher-profile/section-card";
import { Field } from "@/components/shared-form";
import { Textarea } from "@/components/ui/textarea";
import {
  accessLabels,
  accessOrder,
  applyRolePreset,
  rolePresets,
  setFeatureAccessForAllRoles,
  setRoleAccess,
  type RolePresetID,
} from "@/lib/role-policy";

interface PermissionsSectionProps {
  policy: RolePolicy;
  policyMode: "visual" | "json";
  policyText: string;
  policyError: string | null;
  catalog: LauncherPolicyCatalog;
  onPolicyChange: (next: RolePolicy) => void;
  onPolicyModeChange: (mode: "visual" | "json") => void;
  onPolicyTextChange: (text: string) => void;
}

export function PermissionsSection({
  policy,
  policyMode,
  policyText,
  policyError,
  catalog,
  onPolicyChange,
  onPolicyModeChange,
  onPolicyTextChange,
}: PermissionsSectionProps) {
  return (
    <SectionCard
      title="Permissões"
      description="Define o que cada papel de usuário pode ver e alterar dentro do launcher."
      defaultOpen
      rawMode={policyMode === "json"}
      onToggleRaw={(raw) => onPolicyModeChange(raw ? "json" : "visual")}
    >
      <div className="py-4">
        {policyMode === "visual" ? (
          <RolePolicyMatrix
            catalog={catalog}
            policy={policy}
            onChange={onPolicyChange}
          />
        ) : (
          <Field
            label="JSON da role policy"
            hint="Use somente se precisar de campos fora da matriz visual. JSON válido sincroniza automaticamente."
            error={policyError ?? undefined}
            layout="default"
          >
            <Textarea
              rows={14}
              value={policyText}
              onChange={(e) => onPolicyTextChange(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
        )}
      </div>
    </SectionCard>
  );
}

// --- moved from LauncherProfiles.tsx (approx lines 1042-1244) ---

function RolePolicyMatrix({
  catalog,
  policy,
  onChange,
}: {
  catalog: LauncherPolicyCatalog;
  policy: RolePolicy;
  onChange: (policy: RolePolicy) => void;
}) {
  const featuresByGroup = useMemo(
    () =>
      catalog.groups.map((group) => ({
        group,
        features: catalog.features.filter(
          (feature) => feature.group === group.id,
        ),
      })),
    [catalog],
  );

  const setAccess = (roleID: string, featureID: string, access: Access) => {
    onChange(setRoleAccess(policy, roleID, featureID, access));
  };

  const applyPreset = (roleID: string, presetID: RolePresetID) => {
    onChange(applyRolePreset(policy, catalog, roleID, presetID));
  };

  const setRowAccess = (featureID: string, access: Access) => {
    onChange(setFeatureAccessForAllRoles(policy, catalog, featureID, access));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-left text-xs">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="sticky left-0 z-10 w-64 border-b border-zinc-800 bg-zinc-950 px-3 py-3 font-medium">
                Recurso
              </th>
              {catalog.roles.map((role) => (
                <th
                  key={role.id}
                  className="min-w-44 border-b border-zinc-800 px-3 py-3 align-top font-medium"
                >
                  <div className="text-zinc-200">{role.label}</div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                    {role.description}
                  </div>
                  <select
                    aria-label={`Preset for ${role.label}`}
                    className="mt-2 h-7 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200"
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.target.value as RolePresetID | "";
                      if (value) applyPreset(role.id, value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">Apply preset...</option>
                    {rolePresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="w-36 border-b border-zinc-800 px-3 py-3 font-medium">
                Todas roles
              </th>
            </tr>
          </thead>
          <tbody>
            {featuresByGroup.map(({ group, features }) => (
              <MatrixGroup
                key={group.id}
                groupLabel={group.label}
                groupDescription={group.description}
                features={features}
                catalog={catalog}
                policy={policy}
                onSetAccess={setAccess}
                onSetRowAccess={setRowAccess}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixGroup({
  groupLabel,
  groupDescription,
  features,
  catalog,
  policy,
  onSetAccess,
  onSetRowAccess,
}: {
  groupLabel: string;
  groupDescription: string;
  features: LauncherPolicyCatalog["features"];
  catalog: LauncherPolicyCatalog;
  policy: RolePolicy;
  onSetAccess: (roleID: string, featureID: string, access: Access) => void;
  onSetRowAccess: (featureID: string, access: Access) => void;
}) {
  if (features.length === 0) return null;

  return (
    <>
      <tr>
        <td
          colSpan={catalog.roles.length + 2}
          className="border-y border-zinc-800 bg-zinc-900/80 px-3 py-2"
        >
          <div className="font-medium text-zinc-200">{groupLabel}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {groupDescription}
          </div>
        </td>
      </tr>
      {features.map((feature) => (
        <tr key={feature.id} className="border-b border-zinc-900/80 align-top">
          <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-3">
            <div className="font-medium text-zinc-200">{feature.label}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              {feature.description}
              {feature.fallback ? (
                <span className="ml-1 text-zinc-600">
                  Fallback: {feature.fallback}
                </span>
              ) : null}
            </div>
            <code className="mt-1 inline-block rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {feature.id}
            </code>
          </td>
          {catalog.roles.map((role) => (
            <td key={`${role.id}:${feature.id}`} className="px-3 py-3">
              <AccessControl
                value={policy[role.id]?.[feature.id] ?? "none"}
                onChange={(access) => onSetAccess(role.id, feature.id, access)}
              />
            </td>
          ))}
          <td className="px-3 py-3">
            <div className="flex flex-wrap gap-1">
              {accessOrder.map((access) => (
                <button
                  key={access}
                  type="button"
                  onClick={() => onSetRowAccess(feature.id, access)}
                  className="rounded border border-zinc-800 px-1.5 py-1 text-[10px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                >
                  {accessLabels[access]}
                </button>
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function AccessControl({
  value,
  onChange,
}: {
  value: Access;
  onChange: (access: Access) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
      {accessOrder.map((access) => {
        const active = value === access;
        return (
          <button
            key={access}
            type="button"
            onClick={() => onChange(access)}
            className={`min-w-16 rounded px-2 py-1.5 text-[11px] transition ${
              active
                ? access === "write"
                  ? "bg-brand-600 text-white"
                  : access === "read"
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {accessLabels[access]}
          </button>
        );
      })}
    </div>
  );
}

export { RolePolicyMatrix };
