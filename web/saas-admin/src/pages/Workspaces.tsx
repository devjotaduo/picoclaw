import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Download,
  FileText,
  FolderTree,
  GitBranch,
  Hammer,
  Layers3,
  PanelRight,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import {
  buildWorkspaceFrontend,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceSyncStatus,
  importWorkspaceFromHome,
  listWorkspaces,
  readWorkspaceFile,
  updateWorkspace,
  uploadWorkspace,
  validateWorkspace,
  writeWorkspaceFile,
  type Workspace,
  type WorkspaceSyncStatus,
  type WorkspaceValidationRow,
} from "@/api/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import {
  shortWorkspaceHash,
  workspaceSyncBadgeClass,
  workspaceSyncLabel,
} from "@/lib/workspace-sync";
import { cn } from "@/lib/utils";

// Workspaces page — the new admin surface that replaces LauncherProfiles.
//
// Layout mirrors the existing LauncherProfiles screen (left sidebar with the
// list, right pane with metadata + tools) so operators familiar with that
// screen can pick this up without re-learning. Adds two distinctive controls:
//
//   - Default-auto toggle (radio across all workspaces): the workspace used
//     as the default template. Only one can be marked.
//   - "Compilar frontend" button: kicks off the docker-sidecar vite build
//     and shows the log tail when it finishes.

const COMMON_FILES = [
  "home/config.json",
  "home/.security.yml",
  "home/workspace/AGENT.md",
  "home/workspace/SOUL.md",
  "home/workspace/behavior.json",
];

type WorkspaceView = "summary" | "files" | "checks";

const WORKSPACE_VIEWS: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof PanelRight;
}> = [
  { id: "summary", label: "Resumo", icon: PanelRight },
  { id: "files", label: "Arquivos", icon: FolderTree },
  { id: "checks", label: "Validação", icon: ClipboardCheck },
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
  const syncQueries = useQueries({
    queries: workspaces.map((ws) => ({
      queryKey: ["workspace-sync-status", ws.id],
      queryFn: () => getWorkspaceSyncStatus(ws.id),
      staleTime: 30_000,
      retry: false,
    })),
  });
  const syncByWorkspaceId = new Map(
    workspaces.map((ws, index) => [ws.id, syncQueries[index]]),
  );
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const visibleWorkspaces = useMemo(() => {
    const term = workspaceSearch.trim().toLowerCase();
    if (!term) return workspaces;
    return workspaces.filter((ws) =>
      [ws.name, ws.slug, ws.description, ws.host_path]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [workspaceSearch, workspaces]);
  const defaultWorkspace = workspaces.find((ws) => ws.is_default_auto);
  const manualCount = workspaces.filter((ws) => ws.is_available_manual).length;
  const divergedCount = workspaces.filter(
    (ws) => syncByWorkspaceId.get(ws.id)?.data?.status === "diverged",
  ).length;

  useEffect(() => {
    if (!selectedId && workspaces[0]) setSelectedId(workspaces[0].id);
  }, [workspaces, selectedId]);

  // Create new workspace seeded with the embedded baseline (Sofia discovery
  // plus the operational agent roster). Backend auto-extracts the
  // baseline-workspace template when seed_from_baseline is true (default).
  const createM = useMutation({
    mutationFn: () =>
      createWorkspace({
        name: `Novo modelo ${workspaces.length + 1}`,
        slug: `novo-${Date.now()}`,
        description:
          "Modelo baseado no atendimento padrão da Jota Duo.",
        is_default_auto: workspaces.length === 0,
        is_available_manual: true,
        seed_from_baseline: true,
      }),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedId(ws.id);
    },
  });

  // Clone the currently selected workspace into a new one (deep-copies home/).
  // Useful for "duplicate this template" — e.g. clone "default-business" into
  // "saude-clinica" then customize agents/skills for that segment.
  const cloneM = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Selecione um modelo para copiar");
      const baseSlug = selected.slug || "workspace";
      return createWorkspace({
        name: `${selected.name} (cópia)`,
        slug: `${baseSlug}-${Date.now().toString(36)}`,
        description: selected.description
          ? `Clonado de "${selected.name}". ${selected.description}`
          : `Clonado de "${selected.name}".`,
        is_default_auto: false,
        is_available_manual: true,
        clone_from_slug: baseSlug,
      });
    },
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
        description: "Cópia dos arquivos base do operador.",
      }),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedId(ws.id);
    },
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadSlug, setUploadSlug] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadDefaultAuto, setUploadDefaultAuto] = useState(false);
  const [uploadRaw, setUploadRaw] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string>("");
  // Warnings produced by the backend's semantic validator (model_list shape,
  // agents.defaults.model_name resolution, etc.). Empty string = no warnings
  // OR the upload didn't run the validator (raw workspace, or older backend).
  // Cleared on the next upload attempt.
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const uploadM = useMutation({
    mutationFn: () => {
      if (!uploadFile) throw new Error("Selecione um arquivo .zip");
      if (!uploadName.trim()) throw new Error("Preencha o nome");
      return uploadWorkspace({
        name: uploadName.trim(),
        slug: uploadSlug.trim() || undefined,
        description: uploadDescription.trim() || undefined,
        is_default_auto: uploadDefaultAuto,
        is_available_manual: true,
        is_raw: uploadRaw,
        archive: uploadFile,
      });
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      setSelectedId(result.workspace.id);
      const warnings = result.validation?.warnings ?? [];
      setUploadWarnings(warnings);
      // Keep the dialog open if there are warnings so the operator sees
      // them and acknowledges. They can click "Fechar" to dismiss.
      if (warnings.length === 0) {
        setUploadOpen(false);
        setUploadName("");
        setUploadSlug("");
        setUploadDescription("");
        setUploadDefaultAuto(false);
        setUploadRaw(false);
        setUploadFile(null);
      }
      setUploadError("");
    },
    onError: (e: Error) => {
      setUploadError(e.message || "Falha no upload");
      setUploadWarnings([]);
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Modelos de workspace"
        description="Fonte que materializa cada cliente: home/, agentes, skills e frontend."
      >
        <Button
          variant="secondary"
          onClick={() => importM.mutate()}
          disabled={importM.isPending}
        >
          <Download className="size-4" /> Importar base do operador
        </Button>
        <Button variant="secondary" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" /> Upload (.zip)
        </Button>
        <Button
          variant="secondary"
          onClick={() => cloneM.mutate()}
          disabled={cloneM.isPending || !selected}
          title={
            selected
              ? `Duplicar "${selected.name}" como novo template editável`
              : "Selecione um modelo antes para duplicar"
          }
        >
          <Copy className="size-4" /> Clonar selecionado
        </Button>
        <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
          <Plus className="size-4" /> Novo modelo
        </Button>
      </PageHeader>

      {uploadOpen && (
        <UploadWorkspaceDialog
          name={uploadName}
          setName={setUploadName}
          slug={uploadSlug}
          setSlug={setUploadSlug}
          description={uploadDescription}
          setDescription={setUploadDescription}
          defaultAuto={uploadDefaultAuto}
          setDefaultAuto={setUploadDefaultAuto}
          raw={uploadRaw}
          setRaw={setUploadRaw}
          file={uploadFile}
          setFile={setUploadFile}
          error={uploadError}
          warnings={uploadWarnings}
          isPending={uploadM.isPending}
          onCancel={() => {
            setUploadOpen(false);
            setUploadError("");
            setUploadWarnings([]);
          }}
          onSubmit={() => {
            setUploadError("");
            setUploadWarnings([]);
            uploadM.mutate();
          }}
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid min-h-full w-full max-w-[1440px] grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-h-0 lg:sticky lg:top-4 lg:h-[calc(100dvh-8.5rem)]">
            <Card className="flex h-full min-h-[420px] flex-col">
              <CardHeader className="gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Biblioteca</CardTitle>
                    <p className="mt-1 text-xs text-zinc-500">
                      {workspaces.length} modelos · {manualCount} no cadastro manual
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium",
                      divergedCount > 0
                        ? "border-amber-700 bg-amber-950/30 text-amber-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400",
                    )}
                  >
                    {divergedCount} divergentes
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <WorkspaceStat label="Padrão" value={defaultWorkspace?.slug ?? "nenhum"} />
                  <WorkspaceStat label="Raw" value={workspaces.filter((ws) => ws.is_raw).length} />
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-zinc-500" />
                  <Input
                    value={workspaceSearch}
                    onChange={(e) => setWorkspaceSearch(e.target.value)}
                    placeholder="Buscar nome, slug ou caminho"
                    className="pl-8"
                  />
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                {workspacesQ.isLoading ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-6 text-center text-xs text-zinc-500">
                    Carregando modelos...
                  </div>
                ) : workspacesQ.isError ? (
                  <div className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-6 text-center text-xs text-red-300">
                    Falha ao carregar modelos.
                  </div>
                ) : null}

                {visibleWorkspaces.map((ws) => {
                  const syncQ = syncByWorkspaceId.get(ws.id);
                  const syncStatus = syncQ?.data?.status ?? (syncQ?.isError ? "unknown" : undefined);
                  return (
                    <WorkspaceListButton
                      key={ws.id}
                      workspace={ws}
                      selected={selected?.id === ws.id}
                      syncStatus={syncStatus}
                      syncLoading={Boolean(syncQ?.isLoading)}
                      onClick={() => setSelectedId(ws.id)}
                    />
                  );
                })}
                {!workspacesQ.isLoading && workspaces.length === 0 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-6 text-center text-xs text-zinc-500">
                    Nenhum modelo.
                  </div>
                )}
                {!workspacesQ.isLoading && workspaces.length > 0 && visibleWorkspaces.length === 0 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-6 text-center text-xs text-zinc-500">
                    Nenhum resultado para essa busca.
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
          <div className="min-h-0 pb-4">
            {selected ? (
              <WorkspaceEditor
                key={selected.id}
                workspace={selected}
                syncStatus={syncByWorkspaceId.get(selected.id)?.data}
                syncLoading={syncByWorkspaceId.get(selected.id)?.isLoading ?? false}
                syncError={syncByWorkspaceId.get(selected.id)?.isError ?? false}
              />
            ) : (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
                Crie ou importe um modelo para começar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="truncate text-sm font-medium text-zinc-200">{value}</div>
    </div>
  );
}

function WorkspaceListButton({
  workspace,
  selected,
  syncStatus,
  syncLoading,
  onClick,
}: {
  workspace: Workspace;
  selected: boolean;
  syncStatus?: WorkspaceSyncStatus["status"];
  syncLoading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-3 py-3 text-left text-sm transition-colors",
        selected
          ? "border-brand-500/40 bg-brand-500/10 text-zinc-100"
          : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-950",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
            {workspace.is_default_auto ? (
              <WorkspacePill tone="brand">auto</WorkspacePill>
            ) : null}
            {workspace.is_raw ? (
              <WorkspacePill tone="amber">raw</WorkspacePill>
            ) : null}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">
            {workspace.slug}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
            workspaceSyncBadgeClass(syncStatus),
          )}
        >
          {syncLoading ? "..." : workspaceSyncLabel(syncStatus)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
        <span>v{workspace.version}</span>
        <span>{workspace.is_available_manual ? "manual" : "oculto"}</span>
        <span>{workspace.frontend_built_at ? "frontend OK" : "sem build"}</span>
      </div>
    </button>
  );
}

function WorkspacePill({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "brand" | "amber" | "emerald";
}) {
  const tones = {
    zinc: "border-zinc-700 bg-zinc-900 text-zinc-300",
    brand: "border-brand-500/40 bg-brand-500/10 text-brand-200",
    amber: "border-amber-700 bg-amber-950/30 text-amber-300",
    emerald: "border-emerald-700 bg-emerald-950/30 text-emerald-300",
  };
  return (
    <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function WorkspaceHero({
  workspace,
  syncStatus,
  syncLoading,
  syncError,
  dirty,
}: {
  workspace: Workspace;
  syncStatus?: WorkspaceSyncStatus;
  syncLoading: boolean;
  syncError: boolean;
  dirty: boolean;
}) {
  const status = syncStatus?.status ?? (syncError ? "unknown" : undefined);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <WorkspacePill tone={workspace.is_default_auto ? "brand" : "zinc"}>
              {workspace.is_default_auto ? "padrão automático" : "não padrão"}
            </WorkspacePill>
            <WorkspacePill tone={workspace.is_available_manual ? "emerald" : "zinc"}>
              {workspace.is_available_manual ? "manual visível" : "manual oculto"}
            </WorkspacePill>
            {workspace.is_raw ? <WorkspacePill tone="amber">raw</WorkspacePill> : null}
            {dirty ? <WorkspacePill tone="amber">alterações pendentes</WorkspacePill> : null}
          </div>
          <h2 className="truncate text-xl font-semibold text-zinc-100">{workspace.name}</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            {workspace.description || "Sem descrição definida."}
          </p>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
            <Layers3 className="size-4 shrink-0 text-zinc-500" />
            <span className="shrink-0">host_path</span>
            <code className="min-w-0 truncate font-mono text-zinc-300">{workspace.host_path}</code>
          </div>
        </div>

        <div className="grid min-w-[280px] grid-cols-2 gap-2 text-xs">
          <InfoTile label="Slug" value={workspace.slug} mono />
          <InfoTile label="Versão" value={`v${workspace.version}`} />
          <InfoTile
            label="Sincronização"
            value={syncLoading ? "checando" : workspaceSyncLabel(status)}
            tone={status === "synced" ? "emerald" : status === "diverged" ? "amber" : "zinc"}
          />
          <InfoTile
            label="Frontend"
            value={workspace.frontend_built_at ? "compilado" : "pendente"}
            tone={workspace.frontend_built_at ? "emerald" : "zinc"}
          />
        </div>
      </div>
    </section>
  );
}

function InfoTile({
  label,
  value,
  mono,
  tone = "zinc",
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: "zinc" | "amber" | "emerald";
}) {
  const toneClass = {
    zinc: "text-zinc-200",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
  };
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={cn("truncate text-sm font-medium", toneClass[tone], mono && "font-mono text-xs")}>
        {value}
      </div>
    </div>
  );
}

function WorkspaceViewTabs({
  activeView,
  onChange,
}: {
  activeView: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
      {WORKSPACE_VIEWS.map((view) => {
        const Icon = view.icon;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onChange(view.id)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              activeView === view.id
                ? "bg-zinc-100 text-zinc-950"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
            )}
          >
            <Icon className="size-4" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function SwitchLine({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3">
      <div className="min-w-0">
        <div className="font-medium text-zinc-100">{title}</div>
        <div className="text-[11px] text-zinc-500">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function FrontendBuildCard({
  lastBuildLabel,
  isPending,
  result,
  error,
  onBuild,
}: {
  lastBuildLabel: string;
  isPending: boolean;
  result?: { ok: boolean; log_tail: string; error?: string };
  error: unknown;
  onBuild: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Frontend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500">{lastBuildLabel}</div>
          <Button onClick={onBuild} disabled={isPending}>
            <Hammer className="size-4" />
            {isPending ? "Compilando..." : "Compilar frontend"}
          </Button>
        </div>
        {result ? (
          <div
            className={cn(
              "rounded-lg border p-3 text-xs",
              result.ok
                ? "border-emerald-700 bg-emerald-950/30"
                : "border-red-800 bg-red-950/30",
            )}
          >
            <div className="mb-2 font-medium">
              {result.ok ? "Build OK" : `Build falhou: ${result.error ?? ""}`}
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
              {result.log_tail}
            </pre>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs">
            <div className="mb-2 font-medium">
              Build não pôde ser executado: {String((error as Error).message ?? error)}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WorkspaceEditor({
  workspace,
  syncStatus,
  syncLoading,
  syncError,
}: {
  workspace: Workspace;
  syncStatus?: WorkspaceSyncStatus;
  syncLoading: boolean;
  syncError: boolean;
}) {
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
  const [activeView, setActiveView] = useState<WorkspaceView>("summary");

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
    <div className="space-y-4">
      <WorkspaceHero
        workspace={workspace}
        syncStatus={syncStatus}
        syncLoading={syncLoading}
        syncError={syncError}
        dirty={dirty}
      />

      <WorkspaceViewTabs activeView={activeView} onChange={setActiveView} />

      {activeView === "summary" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Identidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-500">Nome</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-500">Slug</label>
                    <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500">Descrição</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <SwitchLine
                    title="Padrão automático"
                    description="Usado como sugestão inicial em novos clientes."
                    checked={isDefaultAuto}
                    onCheckedChange={setIsDefaultAuto}
                  />
                  <SwitchLine
                    title="Cadastro manual"
                    description="Aparece na lista de modelos ao criar cliente."
                    checked={isAvailableManual}
                    onCheckedChange={setIsAvailableManual}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
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
                          `Apagar o modelo "${workspace.name}"? Os arquivos em ${workspace.host_path} ficam no disco.`,
                        )
                      ) {
                        deleteM.mutate();
                      }
                    }}
                    disabled={isDefaultAuto || deleteM.isPending}
                    title={
                      isDefaultAuto
                        ? "Não dá para apagar o modelo marcado como padrão"
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

            <FrontendBuildCard
              lastBuildLabel={lastBuildLabel}
              isPending={buildM.isPending}
              result={buildM.data}
              error={buildM.error}
              onBuild={() => buildM.mutate()}
            />
          </div>

          <div className="space-y-4">
            <WorkspaceSyncPanel
              workspace={workspace}
              syncStatus={syncStatus}
              isLoading={syncLoading}
              isError={syncError}
              compact
            />

            <Card>
              <CardHeader>
                <CardTitle>Acessos rápidos</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Button asChild variant="secondary" className="justify-start">
                  <Link to={`/workspaces/${encodeURIComponent(workspace.id)}/files`}>
                    <FolderTree className="size-4" />
                    Editor completo de arquivos
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="justify-start">
                  <Link to={`/workspaces/${encodeURIComponent(workspace.id)}/mcp`}>
                    <Code2 className="size-4" />
                    MCPs do workspace
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "files" ? <FileEditor workspaceId={workspace.id} /> : null}

      {activeView === "checks" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <ValidationPanel workspaceId={workspace.id} />
          <WorkspaceSyncPanel
            workspace={workspace}
            syncStatus={syncStatus}
            isLoading={syncLoading}
            isError={syncError}
          />
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceSyncPanel({
  workspace,
  syncStatus,
  isLoading,
  isError,
  compact = false,
}: {
  workspace: Workspace;
  syncStatus?: WorkspaceSyncStatus;
  isLoading: boolean;
  isError: boolean;
  compact?: boolean;
}) {
  const status = syncStatus?.status ?? "unknown";
  const checkedAt = syncStatus?.checked_at
    ? new Date(syncStatus.checked_at).toLocaleString()
    : "indisponivel";

  return (
    <Card size={compact ? "sm" : "default"}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <GitBranch className="size-4 text-zinc-500" />
            Sincronização Git
          </span>
          <span
            className={[
              "rounded-md border px-2 py-1 text-[10px] font-medium",
              workspaceSyncBadgeClass(status),
            ].join(" ")}
          >
            {isLoading ? "..." : workspaceSyncLabel(status)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className={cn("grid gap-3 text-xs", compact ? "grid-cols-1" : "grid-cols-2")}>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="text-zinc-500">Hash do modelo</div>
            <code className="font-mono text-zinc-200" title={syncStatus?.admin_hash_sha256 || ""}>
              {shortWorkspaceHash(syncStatus?.admin_hash_sha256)}
            </code>
            <div className="mt-1 text-[11px] text-zinc-500">
              {syncStatus?.admin_file_count ?? 0} arquivos
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="text-zinc-500">Hash do git deployado</div>
            <code className="font-mono text-zinc-200" title={syncStatus?.deployed_git_hash_sha256 || ""}>
              {shortWorkspaceHash(syncStatus?.deployed_git_hash_sha256)}
            </code>
            <div className="mt-1 text-[11px] text-zinc-500">
              {syncStatus?.deployed_file_count ?? 0} arquivos
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="text-zinc-500">Última checagem</div>
            <div className="text-zinc-200">{checkedAt}</div>
            {syncStatus?.deployed_git_commit ? (
              <code className="mt-1 block font-mono text-[11px] text-zinc-500">
                commit {syncStatus.deployed_git_commit}
              </code>
            ) : null}
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div className="text-zinc-500">Versão DB</div>
            <div className="text-zinc-200">v{workspace.version}</div>
            <div className="mt-1 text-[11px] text-zinc-500">
              Revisão administrativa; igualdade real é pelo hash.
            </div>
          </div>
        </div>
        {isError ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            Endpoint indisponível; status tratado como Desconhecido.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FileEditor({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
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
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
      void qc.invalidateQueries({ queryKey: ["workspace-sync-status", workspaceId] });
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
          Caminho relativo ao modelo. Prefixos válidos: <code>home/</code>,{" "}
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

function ValidationPanel({ workspaceId }: { workspaceId: string }) {
  const v = useQuery({
    queryKey: ["workspace-validate", workspaceId],
    queryFn: () => validateWorkspace(workspaceId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Validação do modelo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-zinc-400">
          Checa se este modelo tem os arquivos necessários para criar clientes. Arquivos obrigatórios
          impedem a criação quando faltam; recomendados melhoram segurança e experiência.
        </p>

        {v.isLoading ? (
          <div className="text-xs text-zinc-500">Carregando…</div>
        ) : v.error ? (
          <div className="text-xs text-red-400">
            {v.error instanceof Error ? v.error.message : "erro ao validar"}
          </div>
        ) : v.data ? (
          <>
            <div
              className={[
                "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                v.data.ok
                  ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                  : "border-amber-700 bg-amber-950/30 text-amber-300",
              ].join(" ")}
            >
              {v.data.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {v.data.ok
                ? "Modelo pronto para criar clientes."
                : "Falta pelo menos um arquivo obrigatório. A criação automática pode falhar."}
            </div>
            <ul className="space-y-1 text-xs">
              {v.data.rows.map((row: WorkspaceValidationRow) => (
                <li key={row.path} className="flex items-start gap-2">
                  {row.present ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  ) : row.required ? (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-[11px] text-zinc-200">{row.path}</code>
                      {row.required ? (
                        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase tracking-wider text-zinc-400">
                          obrigatório
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                          recomendado
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500">{row.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UploadWorkspaceDialog(props: {
  name: string;
  setName: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  defaultAuto: boolean;
  setDefaultAuto: (v: boolean) => void;
  raw: boolean;
  setRaw: (v: boolean) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  error: string;
  warnings: string[];
  isPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const pickedFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      // Friendlier than the backend's 415 — catch the obvious wrong type
      // before sending.
      props.setFile(null);
      return;
    }
    props.setFile(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Upload de modelo</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Suba um <code>.zip</code> com qualquer combinação de{" "}
            <code>home/</code>, <code>frontend-src/</code> e{" "}
            <code>frontend-dist/</code> na raiz do arquivo. Também aceita
            só os arquivos de <code>home/</code> direto na raiz (sem prefixo)
            para compatibilidade. O backend detecta o layout e pula
            automaticamente pastas runtime (<code>sessions/</code>,{" "}
            <code>whatsapp/</code>, <code>state/</code>, etc.). Limite 50&nbsp;MB.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">
              Nome
            </label>
            <Input
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              placeholder="Ex: Clínica X — Atendimento"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">
              Slug <span className="text-zinc-500">(opcional — derivado do nome)</span>
            </label>
            <Input
              value={props.slug}
              onChange={(e) => props.setSlug(e.target.value)}
              placeholder="clinica-x"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">
              Descrição <span className="text-zinc-500">(opcional)</span>
            </label>
            <Textarea
              value={props.description}
              onChange={(e) => props.setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <label
            htmlFor="workspace-zip-input"
            className={[
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center text-xs transition-colors",
              dragOver ? "border-blue-500 bg-blue-950/30" : "border-zinc-700 bg-zinc-950 hover:bg-zinc-900",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickedFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload className="size-5 text-zinc-400" />
            {props.file ? (
              <div>
                <div className="font-medium text-zinc-200">{props.file.name}</div>
                <div className="text-zinc-500">
                  {(props.file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar
                </div>
              </div>
            ) : (
              <div>
                <div className="text-zinc-200">Arraste o .zip aqui</div>
                <div className="text-zinc-500">ou clique para escolher</div>
              </div>
            )}
            <input
              id="workspace-zip-input"
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => pickedFile(e.target.files?.[0])}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={props.defaultAuto}
              onChange={(e) => props.setDefaultAuto(e.target.checked)}
            />
            Marcar como modelo padrão para criação automática
            <span className="text-zinc-500">(só um modelo pode ser padrão)</span>
          </label>

          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={props.raw}
              onChange={(e) => props.setRaw(e.target.checked)}
            />
            <span>
              <span className="font-medium">Raw — não tratar arquivos</span>{" "}
              <span className="text-zinc-500">
                (provisioner copia o zip verbatim e pula seed de senha, geração
                de chave LiteLLM, substituição de <code>${"${LITELLM_KEY}"}</code>{" "}
                em <code>config.json</code> e escrita de{" "}
                <code>launcher_policy.json</code>. Os arquivos que você subir
                viram a verdade absoluta — você é responsável por auth + modelos.)
              </span>
            </span>
          </label>
        </div>

        {props.error && (
          <div className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
            {props.error}
          </div>
        )}

        {props.warnings.length > 0 && (
          <div className="rounded border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            <div className="mb-1 font-semibold">Modelo criado com avisos:</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {props.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
          <Button variant="outline" onClick={props.onCancel} disabled={props.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={props.onSubmit}
            disabled={props.isPending || !props.file || !props.name.trim()}
          >
            {props.isPending ? "Enviando..." : "Enviar e criar modelo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
