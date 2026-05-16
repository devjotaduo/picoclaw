import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, Trash2 } from "lucide-react";
import {
  createLauncherProfile,
  deleteLauncherProfile,
  getLauncherProfileSeed,
  importStandaloneLauncherProfile,
  listLauncherProfiles,
  updateLauncherProfile,
  updateLauncherProfileSeed,
  type LauncherProfile,
  type RolePolicy,
} from "@/api/launcher-profiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

const defaultRolePolicy: RolePolicy = {
  tenant_owner: all("write"),
  tenant_admin: all("write"),
  operator: {
    ...all("none"),
    chat: "write",
    whatsapp_inbox: "write",
    logs: "read",
  },
  viewer: {
    ...all("read"),
    credentials: "none",
    raw_config: "none",
  },
};

function all(access: "none" | "read" | "write") {
  return Object.fromEntries(
    [
      "chat",
      "models",
      "credentials",
      "channels",
      "agent_editor",
      "agent_templates",
      "skills",
      "tools",
      "config",
      "raw_config",
      "logs",
      "whatsapp_inbox",
    ].map((feature) => [feature, access]),
  ) as Record<string, "none" | "read" | "write">;
}

export function LauncherProfiles() {
  const qc = useQueryClient();
  const profilesQ = useQuery({ queryKey: ["launcher-profiles"], queryFn: listLauncherProfiles });
  const profiles = profilesQ.data?.profiles ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;

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
        role_policy: defaultRolePolicy,
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
            <CardHeader><CardTitle>Profiles</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedId(profile.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    selected?.id === profile.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    v{profile.version}{profile.is_default ? " · default" : ""}
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

          {selected ? <ProfileEditor profile={selected} /> : null}
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({ profile }: { profile: LauncherProfile }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [slug, setSlug] = useState(profile.slug);
  const [description, setDescription] = useState(profile.description);
  const [isDefault, setIsDefault] = useState(profile.is_default);
  const [rolePolicyText, setRolePolicyText] = useState(formatJSON(profile.role_policy));

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

  useEffect(() => {
    setName(profile.name);
    setSlug(profile.slug);
    setDescription(profile.description);
    setIsDefault(profile.is_default);
    setRolePolicyText(formatJSON(profile.role_policy));
  }, [profile]);

  useEffect(() => {
    setConfigText(seedText.config);
    setAgentText(seedText.agent);
    setSoulText(seedText.soul);
    setBehaviorText(seedText.behavior);
  }, [seedText]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
    await qc.invalidateQueries({ queryKey: ["launcher-profile-seed", profile.id] });
  };

  const saveMetaM = useMutation({
    mutationFn: () =>
      updateLauncherProfile(profile.id, {
        name,
        slug,
        description,
        is_default: isDefault,
        role_policy: JSON.parse(rolePolicyText) as RolePolicy,
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
      {error && <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
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
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <Label>Role policy JSON</Label>
            <textarea
              value={rolePolicyText}
              onChange={(e) => setRolePolicyText(e.target.value)}
              className="h-52 w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-100"
            />
          </div>
          <div className="col-span-2 flex justify-between">
            <Button variant="danger" onClick={() => deleteM.mutate()} disabled={profile.is_default || deleteM.isPending}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => importM.mutate()} disabled={importM.isPending}>
                <Download className="h-4 w-4" /> Import standalone
              </Button>
              <Button onClick={() => saveMetaM.mutate()} disabled={saveMetaM.isPending}>
                <Save className="h-4 w-4" /> Save profile
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seed Workspace</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Editor label="config.json" value={configText} onChange={setConfigText} height="h-72" />
          <Editor label="workspace/AGENT.md" value={agentText} onChange={setAgentText} height="h-56" />
          <Editor label="workspace/SOUL.md" value={soulText} onChange={setSoulText} height="h-44" />
          <Editor label="workspace/behavior.json" value={behaviorText} onChange={setBehaviorText} height="h-44" />
          <div className="flex justify-end">
            <Button onClick={() => saveSeedM.mutate()} disabled={saveSeedM.isPending}>
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

function formatJSON(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
