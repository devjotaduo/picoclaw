import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Download, Hammer, Save, Trash2, FileText, FolderTree } from "lucide-react";

import {
  buildWorkspaceFrontend,
  createWorkspace,
  deleteWorkspace,
  importWorkspaceFromHome,
  listWorkspaces,
  readWorkspaceFile,
  updateWorkspace,
  writeWorkspaceFile,
  type Workspace,
} from "@/api/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";

// Workspaces page — the new admin surface that replaces LauncherProfiles.
//
// Layout mirrors the existing LauncherProfiles screen (left sidebar with the
// list, right pane with metadata + tools) so operators familiar with that
// screen can pick this up without re-learning. Adds two distinctive controls:
//
//   - Default-auto toggle (radio across all workspaces): which one Clara's
//     auto-provisioner picks up. Only one can be marked.
//   - "Compilar frontend" button: kicks off the docker-sidecar vite build
//     and shows the log tail when it finishes.

const COMMON_FILES = [
  "home/config.json",
  "home/.security.yml",
  "home/workspace/AGENT.md",
  "home/workspace/SOUL.md",
  "home/workspace/behavior.json",
];

export function Workspaces() {
  const qc = useQueryClient();
  const workspacesQ = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => listWorkspaces(),
  });
  const workspaces = workspacesQ.data?.workspaces ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const selected =
    workspaces.find((ws) => ws.id === selectedId) ?? workspaces[0] ?? null;

  useEffect(() => {
    if (!selectedId && workspaces[0]) setSelectedId(workspaces[0].id);
  }, [workspaces, selectedId]);

  const createM = useMutation({
    mutationFn: () =>
      createWorkspace({
        name: `Novo workspace ${workspaces.length + 1}`,
        slug: `novo-${Date.now()}`,
        description: "",
        is_default_auto: workspaces.length === 0,
        is_available_manual: true,
      }),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedId(ws.id);
    },
  });

  const importM = useMutation({
    // source_path is intentionally omitted: the backend defaults to
    // $PICOCLAW_HOME (then ~/.picoclaw) so the admin button doesn't have
    // to know the controlplane's filesystem layout. See
    // internal/saas/api/workspaces.go::defaultImportSource.
    mutationFn: () =>
      importWorkspaceFromHome({
        name: "Importado do operador",
        slug: `home-${Date.now()}`,
        description: "Snapshot do $PICOCLAW_HOME do operador.",
      }),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedId(ws.id);
    },
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Workspaces"
        description="Diretórios completos que cada tenant herda no provisionamento — config.json, agentes, skills e o frontend compilado."
      >
        <Button
          variant="secondary"
          onClick={() => importM.mutate()}
          disabled={importM.isPending}
        >
          <Download className="size-4" /> Importar do $PICOCLAW_HOME
        </Button>
        <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
          <Plus className="size-4" /> Novo workspace
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1280px] grid-cols-[260px_minmax(0,1fr)] gap-4 p-4">
          <aside className="self-start">
            <Card>
              <CardHeader>
                <CardTitle>Workspaces</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => setSelectedId(ws.id)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                      selected?.id === ws.id
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="font-medium">{ws.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      v{ws.version}
                      {ws.is_default_auto ? " · auto" : ""}
                      {!ws.is_available_manual ? " · oculto" : ""}
                    </div>
                  </button>
                ))}
                {workspaces.length === 0 && (
                  <div className="rounded bg-zinc-950 px-3 py-6 text-center text-xs text-zinc-500">
                    Nenhum workspace.
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
          <div className="min-h-0 space-y-4">
            {selected ? (
              <WorkspaceEditor key={selected.id} workspace={selected} />
            ) : (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                Crie um workspace ou importe o $PICOCLAW_HOME do operador pra
                começar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceEditor({ workspace }: { workspace: Workspace }) {
  const qc = useQueryClient();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [description, setDescription] = useState(workspace.description);
  const [isDefaultAuto, setIsDefaultAuto] = useState(workspace.is_default_auto);
  const [isAvailableManual, setIsAvailableManual] = useState(
    workspace.is_available_manual,
  );

  const dirty =
    name !== workspace.name ||
    slug !== workspace.slug ||
    description !== workspace.description ||
    isDefaultAuto !== workspace.is_default_auto ||
    isAvailableManual !== workspace.is_available_manual;

  const saveM = useMutation({
    mutationFn: () =>
      updateWorkspace(workspace.id, {
        name,
        slug,
        description,
        is_default_auto: isDefaultAuto,
        is_available_manual: isAvailableManual,
        role_policy: workspace.role_policy,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const deleteM = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const buildM = useMutation({
    mutationFn: () => buildWorkspaceFrontend(workspace.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    // The backend now returns 200 with {ok: false, log_tail, error} on
    // build failure (instead of 502), so this branch only fires for
    // network/auth/parse errors. We still surface the message below.
  });

  const lastBuildLabel = useMemo(() => {
    if (!workspace.frontend_built_at) return "nunca compilado";
    const d = new Date(workspace.frontend_built_at);
    return `compilado em ${d.toLocaleString()}`;
  }, [workspace.frontend_built_at]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Metadados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Slug</label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div>
                <div className="font-medium">Padrão p/ auto-provision</div>
                <div className="text-[11px] text-zinc-500">
                  A Clara cria tenants automáticos com este.
                </div>
              </div>
              <Switch
                checked={isDefaultAuto}
                onCheckedChange={setIsDefaultAuto}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div>
                <div className="font-medium">Disponível no cadastro manual</div>
                <div className="text-[11px] text-zinc-500">
                  Aparece no dropdown ao criar tenant.
                </div>
              </div>
              <Switch
                checked={isAvailableManual}
                onCheckedChange={setIsAvailableManual}
              />
            </label>
          </div>
          <div className="rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
            host_path:{" "}
            <code className="font-mono text-zinc-400">{workspace.host_path}</code>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => saveM.mutate()}
              disabled={!dirty || saveM.isPending}
            >
              <Save className="size-4" /> Salvar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  window.confirm(
                    `Apagar o workspace "${workspace.name}"? Os arquivos em ${workspace.host_path} ficam no disco — só a row do DB sai.`,
                  )
                ) {
                  deleteM.mutate();
                }
              }}
              disabled={isDefaultAuto || deleteM.isPending}
              title={
                isDefaultAuto
                  ? "Não dá pra apagar o workspace marcado como default-auto"
                  : undefined
              }
            >
              <Trash2 className="size-4" /> Apagar
            </Button>
          </div>
          {saveM.error ? (
            <div className="text-xs text-red-400">
              Erro ao salvar: {String((saveM.error as Error).message ?? saveM.error)}
            </div>
          ) : null}
          {deleteM.error ? (
            <div className="text-xs text-red-400">
              Erro ao apagar:{" "}
              {String((deleteM.error as Error).message ?? deleteM.error)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frontend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-xs text-zinc-500">{lastBuildLabel}</div>
          <Button onClick={() => buildM.mutate()} disabled={buildM.isPending}>
            <Hammer className="size-4" />{" "}
            {buildM.isPending ? "Compilando…" : "Compilar frontend"}
          </Button>
          {buildM.data ? (
            <div
              className={`rounded-md border p-3 text-xs ${
                buildM.data.ok
                  ? "border-emerald-700 bg-emerald-950/30"
                  : "border-red-800 bg-red-950/30"
              }`}
            >
              <div className="mb-2 font-medium">
                {buildM.data.ok ? "Build OK" : `Build falhou: ${buildM.data.error ?? ""}`}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
                {buildM.data.log_tail}
              </pre>
            </div>
          ) : buildM.error ? (
            <div className="rounded-md border border-red-800 bg-red-950/30 p-3 text-xs">
              <div className="mb-2 font-medium">
                Build não pôde ser executado:{" "}
                {String((buildM.error as Error).message ?? buildM.error)}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editor completo de arquivos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="mb-3 text-xs text-zinc-400">
            Edite qualquer arquivo do workspace (home/, frontend-src/) com árvore de navegação e
            syntax highlight. Para os arquivos comuns (AGENT.md, SOUL.md, config.json, etc.) você
            pode continuar usando o editor rápido abaixo.
          </p>
          <Link
            to={`/workspaces/${encodeURIComponent(workspace.id)}/files`}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            <FolderTree className="mr-1 size-4" />
            Abrir editor de arquivos
          </Link>
        </CardContent>
      </Card>

      <FileEditor workspaceId={workspace.id} />
    </>
  );
}

function FileEditor({ workspaceId }: { workspaceId: string }) {
  const [path, setPath] = useState(COMMON_FILES[0]);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadM = useMutation({
    mutationFn: (p: string) => readWorkspaceFile(workspaceId, p),
    onSuccess: (file) => {
      setContent(file.content);
      setLoaded(file.path);
      setError("");
    },
    onError: (e: Error) => {
      setError(String(e.message ?? e));
    },
  });

  const saveM = useMutation({
    mutationFn: () => writeWorkspaceFile(workspaceId, path, content),
    onSuccess: () => {
      setLoaded(path);
      setError("");
    },
    onError: (e: Error) => {
      setError(String(e.message ?? e));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arquivos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {COMMON_FILES.map((p) => (
            <Button
              key={p}
              variant={path === p ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPath(p);
                loadM.mutate(p);
              }}
            >
              <FileText className="size-3" /> {p.replace("home/", "")}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="home/workspace/agents/sofia/AGENT.md"
            className="font-mono text-xs"
          />
          <Button
            variant="secondary"
            onClick={() => loadM.mutate(path)}
            disabled={loadM.isPending}
          >
            Carregar
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            <Save className="size-4" /> Salvar
          </Button>
        </div>
        <div className="text-[11px] text-zinc-500">
          Path relativo ao workspace. Prefixos válidos: <code>home/</code>,{" "}
          <code>frontend-src/</code>, <code>frontend-dist/</code>.
        </div>
        {loaded ? (
          <div className="text-[11px] text-zinc-500">Carregado: {loaded}</div>
        ) : null}
        {error ? <div className="text-xs text-red-400">{error}</div> : null}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </CardContent>
    </Card>
  );
}
