import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import {
  createLauncherProfile,
  getLauncherPolicyCatalog,
  listLauncherProfiles,
} from "@/api/launcher-profiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ProfileEditor } from "@/components/launcher-profile/profile-editor";

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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Launcher Profiles"
        description="Configure o launcher base que cada novo tenant recebe."
      >
        <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
          <Plus className="size-4" /> Novo perfil
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1280px] grid-cols-[260px_minmax(0,1fr)] gap-4 p-4">
          <aside className="self-start">
            <Card>
              <CardHeader>
                <CardTitle>Perfis</CardTitle>
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
                    Nenhum perfil ainda.
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
          <div className="min-h-0">
            {selected && policyCatalog ? (
              <ProfileEditor profile={selected} policyCatalog={policyCatalog} />
            ) : selected ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                Carregando catálogo de permissões...
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
