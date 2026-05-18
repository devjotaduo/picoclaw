import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, Trash2 } from "lucide-react";
import {
  createLauncherProfile,
  deleteLauncherProfile,
  getLauncherPolicyCatalog,
  getLauncherProfileSeed,
  importStandaloneLauncherProfile,
  listLauncherProfiles,
  updateLauncherProfile,
  updateLauncherProfileSeed,
  type Access,
  type LauncherPolicyCatalog,
  type LauncherProfile,
  type RolePolicy,
} from "@/api/launcher-profiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  accessLabels,
  accessOrder,
  applyRolePreset,
  formatRolePolicy,
  normalizeRolePolicy,
  parseRolePolicyText,
  rolePresets,
  setFeatureAccessForAllRoles,
  setRoleAccess,
  type RolePresetID,
} from "@/lib/role-policy";
import {
  parseLauncherDisplayConfig,
  setLauncherDisplayOption,
  type LauncherDisplayKey,
} from "@/lib/launcher-display";

export function LauncherProfiles() {
  const qc = useQueryClient();
  const profilesQ = useQuery({
    queryKey: ["launcher-profiles"],
    queryFn: listLauncherProfiles,
  });
  const policyCatalogQ = useQuery({
    queryKey: ["launcher-policy-catalog"],
    queryFn: getLauncherPolicyCatalog,
  });
  const profiles = profilesQ.data?.profiles ?? [];
  const policyCatalog = policyCatalogQ.data ?? null;
  const [selectedId, setSelectedId] = useState<string>("");
  const selected =
    profiles.find((profile) => profile.id === selectedId) ??
    profiles[0] ??
    null;

  useEffect(() => {
    if (!selectedId && profiles[0]) setSelectedId(profiles[0].id);
  }, [profiles, selectedId]);

  const createM = useMutation({
    mutationFn: () =>
      createLauncherProfile({
        name: `Novo perfil ${profiles.length + 1}`,
        slug: `novo-perfil-${Date.now()}`,
        description: "",
        is_default: profiles.length === 0,
        role_policy: policyCatalog?.default_role_policy ?? {},
      }),
    onSuccess: async (profile) => {
      await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
      setSelectedId(profile.id);
    },
  });

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Launcher Profiles</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Configure the base launcher each new tenant receives.
            </p>
          </div>
          <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
            Create profile
          </Button>
        </header>

        <div className="grid grid-cols-[260px_1fr] gap-4">
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Profiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedId(profile.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selected?.id === profile.id
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    v{profile.version}
                    {profile.is_default ? " · default" : ""}
                  </div>
                </button>
              ))}
              {profiles.length === 0 && (
                <div className="rounded bg-zinc-950 px-3 py-6 text-center text-xs text-zinc-500">
                  No profiles yet.
                </div>
              )}
            </CardContent>
          </Card>

          {selected && policyCatalog ? (
            <ProfileEditor profile={selected} policyCatalog={policyCatalog} />
          ) : selected ? (
            <Card>
              <CardContent className="py-8 text-sm text-zinc-500">
                Loading role policy catalog...
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({
  profile,
  policyCatalog,
}: {
  profile: LauncherProfile;
  policyCatalog: LauncherPolicyCatalog;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [slug, setSlug] = useState(profile.slug);
  const [description, setDescription] = useState(profile.description);
  const [isDefault, setIsDefault] = useState(profile.is_default);
  const [rolePolicy, setRolePolicy] = useState<RolePolicy>(() =>
    normalizeRolePolicy(profile.role_policy, policyCatalog),
  );
  const [rolePolicyText, setRolePolicyText] = useState(() =>
    formatRolePolicy(normalizeRolePolicy(profile.role_policy, policyCatalog)),
  );
  const [rolePolicyTextError, setRolePolicyTextError] = useState<string | null>(
    null,
  );
  const [rolePolicyMode, setRolePolicyMode] = useState<"visual" | "json">(
    "visual",
  );

  const seedQ = useQuery({
    queryKey: ["launcher-profile-seed", profile.id],
    queryFn: () => getLauncherProfileSeed(profile.id),
  });

  const seedText = useMemo(() => {
    const seed = seedQ.data;
    return {
      config: formatJSON(seed?.config_json ?? {}),
      agent: seed?.agent_md ?? "",
      soul: seed?.soul_md ?? "",
      behavior: formatJSON(seed?.behavior_json ?? {}),
    };
  }, [seedQ.data]);

  const [configText, setConfigText] = useState("{}");
  const [agentText, setAgentText] = useState("");
  const [soulText, setSoulText] = useState("");
  const [behaviorText, setBehaviorText] = useState("{}");
  const launcherDisplay = useMemo(
    () => parseLauncherDisplayConfig(configText),
    [configText],
  );

  useEffect(() => {
    setName(profile.name);
    setSlug(profile.slug);
    setDescription(profile.description);
    setIsDefault(profile.is_default);
    const normalized = normalizeRolePolicy(profile.role_policy, policyCatalog);
    setRolePolicy(normalized);
    setRolePolicyText(formatRolePolicy(normalized));
    setRolePolicyTextError(null);
    setRolePolicyMode("visual");
  }, [profile, policyCatalog]);

  useEffect(() => {
    setConfigText(seedText.config);
    setAgentText(seedText.agent);
    setSoulText(seedText.soul);
    setBehaviorText(seedText.behavior);
  }, [seedText]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
    await qc.invalidateQueries({
      queryKey: ["launcher-profile-seed", profile.id],
    });
  };

  const syncRolePolicy = (nextPolicy: RolePolicy) => {
    const normalized = normalizeRolePolicy(nextPolicy, policyCatalog);
    setRolePolicy(normalized);
    setRolePolicyText(formatRolePolicy(normalized));
    setRolePolicyTextError(null);
  };

  const handleRolePolicyTextChange = (value: string) => {
    setRolePolicyText(value);
    const result = parseRolePolicyText(value, policyCatalog);
    setRolePolicyTextError(result.error);
    if (result.policy) {
      setRolePolicy(result.policy);
    }
  };

  const handleLauncherDisplayChange = (
    key: LauncherDisplayKey,
    value: boolean,
  ) => {
    setConfigText(setLauncherDisplayOption(configText, key, value));
  };

  const saveMetaM = useMutation({
    mutationFn: () =>
      updateLauncherProfile(profile.id, {
        name,
        slug,
        description,
        is_default: isDefault,
        role_policy: rolePolicy,
      }),
    onSuccess: invalidate,
  });

  const saveSeedM = useMutation({
    mutationFn: () =>
      updateLauncherProfileSeed(profile.id, {
        config_json: JSON.parse(configText),
        agent_md: agentText,
        soul_md: soulText,
        behavior_json: JSON.parse(behaviorText),
      }),
    onSuccess: invalidate,
  });

  const importM = useMutation({
    mutationFn: () => importStandaloneLauncherProfile(profile.id),
    onSuccess: invalidate,
  });

  const deleteM = useMutation({
    mutationFn: () => deleteLauncherProfile(profile.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
    },
  });

  const error =
    (saveMetaM.error as { error?: string } | null)?.error ??
    (saveSeedM.error as { error?: string } | null)?.error ??
    (importM.error as { error?: string } | null)?.error ??
    (deleteM.error as { error?: string } | null)?.error;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            Default for new tenants
          </label>
          <div className="col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <Label className="mb-0">Role policy</Label>
                <p className="mt-1 text-xs text-zinc-500">
                  Configure what each tenant role can see or change in the
                  launcher.
                </p>
              </div>
              <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => setRolePolicyMode("visual")}
                  className={`rounded px-3 py-1.5 text-xs ${
                    rolePolicyMode === "visual"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  Visual
                </button>
                <button
                  type="button"
                  onClick={() => setRolePolicyMode("json")}
                  className={`rounded px-3 py-1.5 text-xs ${
                    rolePolicyMode === "json"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  JSON avancado
                </button>
              </div>
            </div>

            {rolePolicyMode === "visual" ? (
              <RolePolicyMatrix
                catalog={policyCatalog}
                policy={rolePolicy}
                onChange={syncRolePolicy}
              />
            ) : (
              <div>
                <textarea
                  value={rolePolicyText}
                  onChange={(e) => handleRolePolicyTextChange(e.target.value)}
                  className={`h-72 w-full rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 ${
                    rolePolicyTextError ? "border-red-700" : "border-zinc-700"
                  }`}
                />
                {rolePolicyTextError ? (
                  <p className="mt-2 text-xs text-red-300">
                    {rolePolicyTextError}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    Valid JSON is synchronized with the visual editor
                    automatically.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="col-span-2 flex justify-between">
            <Button
              variant="danger"
              onClick={() => deleteM.mutate()}
              disabled={profile.is_default || deleteM.isPending}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => importM.mutate()}
                disabled={importM.isPending}
              >
                <Download className="h-4 w-4" /> Import standalone
              </Button>
              <Button
                onClick={() => saveMetaM.mutate()}
                disabled={saveMetaM.isPending || rolePolicyTextError !== null}
              >
                <Save className="h-4 w-4" /> Save profile
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seed Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LauncherDisplayOptions
            state={launcherDisplay}
            onChange={handleLauncherDisplayChange}
          />
          <Editor
            label="config.json"
            value={configText}
            onChange={setConfigText}
            height="h-72"
          />
          <Editor
            label="workspace/AGENT.md"
            value={agentText}
            onChange={setAgentText}
            height="h-56"
          />
          <Editor
            label="workspace/SOUL.md"
            value={soulText}
            onChange={setSoulText}
            height="h-44"
          />
          <Editor
            label="workspace/behavior.json"
            value={behaviorText}
            onChange={setBehaviorText}
            height="h-44"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => saveSeedM.mutate()}
              disabled={saveSeedM.isPending}
            >
              <Save className="h-4 w-4" /> Save seed files
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Editor({
  label,
  value,
  onChange,
  height,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  height: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${height} w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-100`}
      />
    </div>
  );
}

function LauncherDisplayOptions({
  state,
  onChange,
}: {
  state: {
    showReasoning: boolean;
    showToolCalls: boolean;
    error: string | null;
  };
  onChange: (key: LauncherDisplayKey, value: boolean) => void;
}) {
  const disabled = state.error !== null;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-3">
        <Label>Interface do chat</Label>
        <p className="mt-1 text-xs text-zinc-500">
          Controle se o launcher mostra raciocínio e chamadas de ferramentas
          para os usuários.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DisplayCheckbox
          label="Mostrar raciocínio"
          description="Exibe mensagens internas do tipo thought no chat e no histórico."
          checked={state.showReasoning}
          disabled={disabled}
          onChange={(checked) => onChange("show_reasoning", checked)}
        />
        <DisplayCheckbox
          label="Mostrar chamadas de ferramentas"
          description="Exibe o bloco de ferramentas chamadas, argumentos e explicações."
          checked={state.showToolCalls}
          disabled={disabled}
          onChange={(checked) => onChange("show_tool_calls", checked)}
        />
      </div>
      {state.error ? (
        <p className="mt-3 text-xs text-red-300">
          Corrija o config.json para editar estas opções: {state.error}
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          Salvo em{" "}
          <code className="rounded bg-zinc-900 px-1">ui.show_reasoning</code> e{" "}
          <code className="rounded bg-zinc-900 px-1">ui.show_tool_calls</code>.
        </p>
      )}
    </section>
  );
}

function DisplayCheckbox({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm ${
        disabled ? "opacity-60" : "hover:border-zinc-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-600"
      />
      <span>
        <span className="block font-medium text-zinc-200">{label}</span>
        <span className="mt-1 block text-xs leading-snug text-zinc-500">
          {description}
        </span>
      </span>
    </label>
  );
}

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

function formatJSON(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
