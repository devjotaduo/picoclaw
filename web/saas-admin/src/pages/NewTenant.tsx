import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Loader2 } from "lucide-react";
import { createTenant, getTenant, markPasswordDelivered, type CreateTenantInput, type CreateTenantResponse, type TenantType } from "@/api/tenants";
import { listWorkspaces } from "@/api/workspaces";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateSubdomain(value: string): string | null {
  if (!value) return "Subdomain is required.";
  if (value.length < 3 || value.length > 30) return "Only lowercase letters, numbers, hyphens. Max 30 chars.";
  if (!SUBDOMAIN_RE.test(value)) return "Only lowercase letters, numbers, hyphens. Max 30 chars.";
  return null;
}

interface TypeCard {
  id: TenantType;
  title: string;
  tagline: string;
  bullets: string[];
  subdomainHint: string;
  displayNameHint: string;
}

// Step 1 cards. Order: publico, admin, cliente (default last so the eye lands
// on the safe option after scanning the two specialised choices). Mirrors the
// launcher's web/frontend/src/routes/admin/tenants/new.tsx wizard.
const TYPE_CARDS: TypeCard[] = [
  {
    id: "publico",
    title: "Público",
    tagline: "Chat anônimo, sem login",
    bullets: [
      "Visitante interage sem cadastro",
      "Sem owner, sem senha, sem painel",
      "Usado para landing / discovery / Sofia",
    ],
    subdomainHint: "onboarding",
    displayNameHint: "Onboarding",
  },
  {
    id: "admin",
    title: "Admin",
    tagline: "Painel SaaS interno",
    bullets: [
      "Sidebar /admin/* habilitada",
      "Owner é membro do time",
      "Tudo visível: skills, tools, logs, config",
    ],
    subdomainHint: "ops",
    displayNameHint: "Operações",
  },
  {
    id: "cliente",
    title: "Cliente",
    tagline: "Cliente pagante (default)",
    bullets: [
      "Owner recebe credenciais por email",
      "Vê chat, agente, WhatsApp, config básica",
      "Sem ferramentas de admin",
    ],
    subdomainHint: "acme",
    displayNameHint: "Acme Corp",
  },
];

export function NewTenant() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tenantType, setTenantType] = useState<TenantType | null>(null);
  const [form, setForm] = useState<CreateTenantInput>({
    display_name: "",
    owner_email: "",
    subdomain: "",
    workspace_id: "",
    monthly_budget_usd: 5,
    mem_limit_mb: 512,
    cpu_quota: 0.5,
  });
  const [result, setResult] = useState<CreateTenantResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const subdomainRef = useRef<HTMLInputElement>(null);
  const workspacesQ = useQuery({
    queryKey: ["workspaces", "manual"],
    queryFn: () => listWorkspaces({ manualOnly: true }),
  });
  const workspaces = workspacesQ.data?.workspaces ?? [];
  const defaultWorkspace = workspaces.find((ws) => ws.is_default_auto);
  // Pre-select the auto-default workspace so the admin can click "Create"
  // without thinking; they can switch via the dropdown when needed.
  useEffect(() => {
    if (!form.workspace_id && defaultWorkspace) {
      setForm((prev) => ({ ...prev, workspace_id: defaultWorkspace.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWorkspace?.id]);

  const m = useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["tenant-status", result?.tenant_id],
    queryFn: () => getTenant(result!.tenant_id),
    enabled: !!result,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "provisioning" || s === undefined ? 2000 : false;
    },
  });

  const tenantStatus = statusQuery.data?.status;
  const isProvisioning = !tenantStatus || tenantStatus === "provisioning";
  const hasError = tenantStatus === "error";

  const errPayload = (() => {
    const e = m.error as unknown;
    if (!e || typeof e !== "object") return null;
    return e as {
      error?: string;
      status?: number;
      body?: { tenant_id?: string; url?: string };
    };
  })();
  const errMsg = errPayload?.error ?? (m.error ? "request failed" : null);
  const duplicateTenant =
    errPayload && errPayload.status === 409 && errPayload.body?.tenant_id
      ? {
          tenantId: errPayload.body.tenant_id,
          url: errPayload.body.url,
        }
      : null;

  // Públicos não têm owner — email é hidden e não vai pra API.
  const needsOwnerEmail = tenantType !== "publico";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantType) return;
    const err = validateSubdomain(form.subdomain);
    if (err) {
      setSubdomainError(err);
      subdomainRef.current?.focus();
      return;
    }
    m.mutate({
      ...form,
      tenant_type: tenantType,
      owner_email: needsOwnerEmail ? form.owner_email : "",
    });
  };

  const copyValue = async (value: string | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const markDelivered = async () => {
    if (!result) return;
    await markPasswordDelivered(result.tenant_id);
    nav(`/tenants/${result.tenant_id}`);
  };

  // Step 1: type picker. Nothing else renders until the admin chooses.
  if (!tenantType) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Novo tenant</h1>
          <p className="text-sm text-zinc-400">
            Escolha o tipo. Isso define o que o usuário vai ver (a UI inteira
            sai de <code className="font-mono text-xs">ui-visibility.json</code>{" "}
            do workspace; o tipo selecionado vira o{" "}
            <code className="font-mono text-xs">active_profile</code>).
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          {TYPE_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setTenantType(card.id)}
              className="group flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <div>
                <div className="text-lg font-semibold text-zinc-100">
                  {card.title}
                </div>
                <div className="text-xs text-zinc-500">{card.tagline}</div>
              </div>
              <ul className="flex flex-col gap-1.5 text-sm text-zinc-400">
                {card.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-zinc-600">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-start">
          <Button type="button" variant="outline" onClick={() => nav("/tenants")}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: form for the chosen type.
  const card = TYPE_CARDS.find((c) => c.id === tenantType)!;
  return (
    <div className="mx-auto max-w-xl p-6">
      <header className="mb-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTenantType(null)}
            className="text-zinc-500 underline hover:text-zinc-200"
          >
            ← tipo
          </button>
          <span className="text-zinc-600">/</span>
          <span className="text-sm font-medium text-zinc-200">{card.title}</span>
        </div>
        <h1 className="text-xl font-semibold">Novo tenant — {card.title}</h1>
        <p className="text-xs text-zinc-500">{card.tagline}</p>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            required
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder={card.displayNameHint}
          />
        </div>
        {needsOwnerEmail && (
          <div>
            <Label htmlFor="owner_email">Owner email</Label>
            <Input
              id="owner_email"
              type="email"
              required
              value={form.owner_email}
              onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
            />
            {tenantType === "admin" && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Será membro do time interno com role tenant_owner.
              </p>
            )}
          </div>
        )}
        <div>
          <Label htmlFor="subdomain">Subdomain (lowercase, 3–30 chars)</Label>
          <Input
            id="subdomain"
            ref={subdomainRef}
            required
            maxLength={30}
            value={form.subdomain}
            onChange={(e) => {
              const v = e.target.value.toLowerCase();
              setForm({ ...form, subdomain: v });
              setSubdomainError(validateSubdomain(v));
            }}
            onBlur={() => setSubdomainError(validateSubdomain(form.subdomain))}
            className={subdomainError ? "border-red-500 focus:border-red-500" : undefined}
            placeholder={card.subdomainHint}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {subdomainError && (
            <p className="mt-1 text-xs text-red-400">{subdomainError}</p>
          )}
        </div>
        <div>
          <Label htmlFor="workspace_id">Workspace</Label>
          {workspaces.length === 0 ? (
            <p className="rounded border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
              Nenhum workspace cadastrado.{" "}
              <a className="underline" href="/workspaces">
                Crie um workspace primeiro
              </a>{" "}
              — sem isso o tenant não pode ser provisionado.
            </p>
          ) : (
            <>
              <select
                id="workspace_id"
                required
                value={form.workspace_id}
                onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-100"
              >
                <option value="">— escolha um workspace —</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} · v{ws.version}
                    {ws.is_default_auto ? " (default auto)" : ""}
                    {ws.frontend_built_at ? "" : " · frontend não compilado"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-500">
                Traz config.json, agentes, skills e o frontend compilado.{" "}
                <a className="underline" href="/workspaces">
                  Gerenciar workspaces
                </a>
                .
              </p>
            </>
          )}
        </div>
        {needsOwnerEmail && (
          <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
            O owner recebe por email: <strong>URL</strong>,{" "}
            <strong>login</strong> e <strong>senha inicial</strong>. O fluxo manual
            usa autenticação do Launcher; magic links ficam restritos a tenants
            legados ou links gerados na tela do tenant.
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="budget">Budget USD/mo</Label>
            <Input
              id="budget"
              type="number"
              step="0.01"
              min="0"
              value={form.monthly_budget_usd ?? ""}
              onChange={(e) => setForm({ ...form, monthly_budget_usd: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="mem">Memory MB</Label>
            <Input
              id="mem"
              type="number"
              min="128"
              max="8192"
              value={form.mem_limit_mb ?? 512}
              onChange={(e) => setForm({ ...form, mem_limit_mb: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="cpu">CPU quota</Label>
            <Input
              id="cpu"
              type="number"
              step="0.1"
              min="0.1"
              max="8"
              value={form.cpu_quota ?? 0.5}
              onChange={(e) => setForm({ ...form, cpu_quota: Number(e.target.value) })}
            />
          </div>
        </div>

        {errMsg && (
          <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">
            <div>{errMsg}</div>
            {duplicateTenant && (
              <div className="mt-1.5 text-red-200">
                Existing tenant:{" "}
                <button
                  type="button"
                  className="underline hover:text-red-100"
                  onClick={() => nav(`/tenants/${duplicateTenant.tenantId}`)}
                >
                  {duplicateTenant.tenantId}
                </button>
                {duplicateTenant.url && (
                  <>
                    {" · "}
                    <a
                      href={duplicateTenant.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-red-100"
                    >
                      {duplicateTenant.url}
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setTenantType(null)}>
            Voltar
          </Button>
          <Button type="submit" disabled={m.isPending}>
            {m.isPending ? "Provisioning…" : "Create tenant"}
          </Button>
        </div>
      </form>

      <Dialog open={!!result} onClose={markDelivered} title="Tenant provisioned" size="md" closable={false}>
        {result && (
          <div className="space-y-3 text-sm">
            {result.warning && <p className="text-amber-300">{result.warning}</p>}

            {/* Provisioning status banner */}
            {isProvisioning && (
              <div className="flex items-center gap-2 rounded bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Waiting for container to start…
              </div>
            )}
            {hasError && (
              <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">
                Provisioning error: {statusQuery.data?.last_error ?? "check server logs"}
              </div>
            )}

            <div>
              <Label>URL</Label>
              <div className="flex items-center gap-2 rounded bg-zinc-950 px-3 py-2 font-mono text-xs">
                {isProvisioning ? (
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {result.url}
                  </span>
                ) : (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-500 underline"
                  >
                    {result.url}
                  </a>
                )}
              </div>
            </div>

            {result.info && (
              <div className="rounded bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
                {result.info}
              </div>
            )}

            {result.magic_link && (
              <div>
                <Label>Magic link</Label>
                <p className="mb-1 text-xs text-zinc-500">
                  Single-use sign-in URL for {form.owner_email}. Share manually
                  if Supabase email delivery fails.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                    {result.magic_link}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => copyValue(result.magic_link)}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {result.initial_password && (
              <div>
                <Label>Initial password</Label>
                <p className="mb-1 text-xs text-amber-300">
                  Save this now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                    {result.initial_password}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => copyValue(result.initial_password)}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {result.owner_invite_token && (
              <div>
                <Label>Owner invite token (fallback)</Label>
                <p className="mb-1 text-xs text-zinc-500">
                  Kept for manual delivery if email failed.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                    {result.owner_invite_token}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => copyValue(result.owner_invite_token)}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={markDelivered} disabled={isProvisioning}>
                {isProvisioning
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Provisionando…</>
                  : "Open tenant"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
