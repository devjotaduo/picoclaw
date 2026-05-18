import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  getLauncherProfileSeed,
  updateLauncherProfile,
  updateLauncherProfileSeed,
  type LauncherPolicyCatalog,
  type LauncherProfile,
} from "@/api/launcher-profiles";

import { AgentsSection } from "@/components/launcher-profile/sections/agents-section";
import { BehaviorSection } from "@/components/launcher-profile/sections/behavior-section";
import { ChannelsSection } from "@/components/launcher-profile/sections/channels-section";
import { DisplaySection } from "@/components/launcher-profile/sections/display-section";
import { ModelsSection } from "@/components/launcher-profile/sections/models-section";
import { PermissionsSection } from "@/components/launcher-profile/sections/permissions-section";
import { ProfileSection } from "@/components/launcher-profile/sections/profile-section";
import { WorkspaceFilesSection } from "@/components/launcher-profile/sections/workspace-files-section";
import { DirtyBar } from "@/components/launcher-profile/dirty-bar";

import {
  buildFormFromSeed,
  buildSeedFromForm,
  isFormDirty,
  type LauncherProfileForm,
  type SeedBundle,
} from "@/lib/launcher-profile-form";
import {
  formatRolePolicy,
  normalizeRolePolicy,
  parseRolePolicyText,
} from "@/lib/role-policy";

interface ProfileEditorProps {
  profile: LauncherProfile;
  policyCatalog: LauncherPolicyCatalog;
}

export function ProfileEditor({ profile, policyCatalog }: ProfileEditorProps) {
  const qc = useQueryClient();
  const seedQ = useQuery({
    queryKey: ["launcher-profile-seed", profile.id],
    queryFn: () => getLauncherProfileSeed(profile.id),
  });

  const seed: SeedBundle = useMemo(
    () => ({
      config_json: (seedQ.data?.config_json ?? {}) as Record<string, unknown>,
      agent_md: seedQ.data?.agent_md ?? "",
      soul_md: seedQ.data?.soul_md ?? "",
      behavior_json: (seedQ.data?.behavior_json ?? {}) as Record<string, unknown>,
    }),
    [seedQ.data],
  );

  const [form, setForm] = useState<LauncherProfileForm | null>(null);
  const [baseline, setBaseline] = useState<LauncherProfileForm | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!seedQ.data) return;
    const built = buildFormFromSeed(profile, seed);
    // normalize role policy to the catalog
    built.rolePolicy = normalizeRolePolicy(built.rolePolicy, policyCatalog);
    built.rolePolicyText = formatRolePolicy(built.rolePolicy);
    setForm(built);
    setBaseline(built);
    setErrorMessage(undefined);
  }, [profile.id, seedQ.data, policyCatalog, seed]);

  const update = <K extends keyof LauncherProfileForm>(key: K, value: LauncherProfileForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const dirty = form && baseline ? isFormDirty(form, baseline) : false;

  const saveMeta = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Form not loaded");
      return updateLauncherProfile(profile.id, {
        name: form.name,
        slug: form.slug,
        description: form.description,
        is_default: form.isDefault,
        role_policy: form.rolePolicy,
      });
    },
  });
  const saveSeed = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Form not loaded");
      const seedOut = buildSeedFromForm(form);
      return updateLauncherProfileSeed(profile.id, {
        config_json: seedOut.config_json,
        agent_md: seedOut.agent_md,
        soul_md: seedOut.soul_md,
        behavior_json: seedOut.behavior_json,
      });
    },
  });

  const handleSave = async () => {
    if (!form) return;
    setErrorMessage(undefined);
    try {
      await saveMeta.mutateAsync();
      await saveSeed.mutateAsync();
      setBaseline(form);
      await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
      await qc.invalidateQueries({ queryKey: ["launcher-profile-seed", profile.id] });
    } catch (err) {
      const msg = (err as { error?: string; message?: string }).error
        ?? (err as Error).message
        ?? "Erro desconhecido ao salvar.";
      setErrorMessage(msg);
    }
  };

  const handleReset = () => baseline && setForm(baseline);

  if (!form) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
        Carregando perfil...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto p-3 lg:p-6">
        <div className="mx-auto w-full max-w-[1000px] space-y-6">
          <ProfileSection form={form} onChange={update} />
          <PermissionsSection
            policy={form.rolePolicy}
            policyMode={form.rolePolicyMode}
            policyText={form.rolePolicyText}
            policyError={form.rolePolicyTextError}
            catalog={policyCatalog}
            onPolicyChange={(p) => {
              const normalized = normalizeRolePolicy(p, policyCatalog);
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      rolePolicy: normalized,
                      rolePolicyText: formatRolePolicy(normalized),
                      rolePolicyTextError: null,
                    }
                  : prev,
              );
            }}
            onPolicyModeChange={(mode) => update("rolePolicyMode", mode)}
            onPolicyTextChange={(text) => {
              const result = parseRolePolicyText(text, policyCatalog);
              setForm((prev) =>
                prev
                  ? {
                      ...prev,
                      rolePolicyText: text,
                      rolePolicy: result.policy ?? prev.rolePolicy,
                      rolePolicyTextError: result.error,
                    }
                  : prev,
              );
            }}
          />
          <AgentsSection agents={form.agents} onChange={(a) => update("agents", a)} />
          <ChannelsSection value={form.channels} onChange={(c) => update("channels", c)} />
          <BehaviorSection value={form.behavior} onChange={(b) => update("behavior", b)} />
          <DisplaySection value={form.display} onChange={(d) => update("display", d)} />
          <ModelsSection models={form.models} onChange={(m) => update("models", m)} />
          <WorkspaceFilesSection
            agentMD={form.agentMD}
            soulMD={form.soulMD}
            onAgentMDChange={(v) => update("agentMD", v)}
            onSoulMDChange={(v) => update("soulMD", v)}
          />
        </div>
      </div>
      <DirtyBar
        dirty={dirty}
        saving={saveMeta.isPending || saveSeed.isPending}
        errorMessage={errorMessage}
        onReset={handleReset}
        onSave={handleSave}
      />
    </div>
  );
}
