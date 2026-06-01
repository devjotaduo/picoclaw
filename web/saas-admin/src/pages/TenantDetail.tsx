import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Check, Sparkles, Bot, ExternalLink, PlusCircle, ScrollText, FolderTree, Link2, Mail } from "lucide-react";
import {
  getTenant,
  getUsage,
  suspendTenant,
  resumeTenant,
  deleteTenant,
  rotatePassword,
  setCRMLinks,
  listMembers,
  createInvite,
  generateTenantMagicLink,
  consumeMagicLink,
  resendCredentials,
  recreateTenant,
  cloneTenant,
  getTenantSanity,
  listTenantMagicLinks,
  getTenantModelRouting,
  updateTenantModelRouting,
  type MagicLinkRole,
  type SanityCheck,
  type TenantCLIProvider,
  type TenantModelRoutingInput,
  type TenantModelRoutingMode,
} from "@/api/tenants";
import { listPlatformLiteLLMModels } from "@/api/platform-litellm";
import {
  getCRMContact,
  listContactDeals,
  createCRMContact,
  createCRMDeal,
  STAGE_LABEL,
  STAGE_COLOR,
} from "@/api/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { CopyText } from "@/components/ui/copy-text";
import { CopyableField } from "@/components/ui/copyable-field";
import { SkeletonCard } from "@/components/ui/skeleton";
import { PromoteTenantCard } from "@/components/tenant/promote-tenant-card";
import { ResendCredentialsDialog } from "@/components/tenant/resend-credentials-dialog";
import { RotatedPasswordDialog } from "@/components/tenant/rotated-password-dialog";
import { LiteLLMModelMultiSelect, LiteLLMModelSelect } from "@/components/tenant/litellm-model-picker";
import { formatDate, formatInt, formatUSD, relativeTime } from "@/lib/utils";
import {
  CLAUDE_CLI_MODEL_PRESETS,
  CODEX_CLI_MODEL_PRESETS,
  CUSTOM_CLI_MODEL_PRESET_ID,
  DEFAULT_LITELLM_FALLBACKS,
  DEFAULT_LITELLM_MODEL_NAME,
  cliModelValueFromPreset,
  cliPresetDescription,
  cliPresetIDForModel,
  normalizeModelList,
  removeModelName,
} from "@/lib/model-routing";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export function TenantDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { status } = useAuth();
  const { toast } = useToast();

  const [usageFrom, setUsageFrom] = useState(firstOfMonthISO);
  const [usageTo, setUsageTo] = useState(todayISO);

  const t = useQuery({ queryKey: ["tenant", id], queryFn: () => getTenant(id), refetchInterval: 10_000 });
  const u = useQuery({
    queryKey: ["usage", id, usageFrom, usageTo],
    queryFn: () => getUsage(id, usageFrom, usageTo),
    refetchInterval: 60_000,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [rotatedPwd, setRotatedPwd] = useState<string | null>(null);
  // copy-feedback state for RotatedPasswordDialog lives inside the component now.
  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const [magicLinkData, setMagicLinkData] = useState<{
    url: string;
    expires_at: string;
    token: string;
    short_magic_link?: string;
    access_link?: string;
    warning?: string;
  } | null>(null);
  const [magicLinkCopied, setMagicLinkCopied] = useState(false);
  const [magicLinkSummary, setMagicLinkSummary] = useState("");
  const [magicLinkConsumed, setMagicLinkConsumed] = useState(false);
  // Role selector for the next magic link to mint. Default "public" keeps
  // the legacy lead-onboarding behavior; "tenant_owner" / "tenant_admin"
  // produce a password-less owner/admin login link (TTL-capped server-side).
  const [magicLinkRole, setMagicLinkRole] = useState<MagicLinkRole>("public");
  // Role recovered from the token of the LAST minted link, so the dialog
  // can warn appropriately. The token payload is base64-url JSON like
  // {"tid":...,"exp":...,"n":...,"r":"tenant_owner"} — `r` is omitted for
  // public links via Go's omitempty.
  const mintedMagicRole: MagicLinkRole = (() => {
    if (!magicLinkData?.token) return "public";
    try {
      const payload = magicLinkData.token.split(".")[0];
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      const r = claims?.r;
      return r === "tenant_owner" || r === "tenant_admin" ? r : "public";
    } catch {
      return "public";
    }
  })();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", id] });

  const suspendM = useMutation({
    mutationFn: () => suspendTenant(id),
    onSuccess: () => { invalidate(); toast({ type: "info", message: "Cliente suspenso." }); },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao suspender." }),
  });
  const resumeM = useMutation({
    mutationFn: () => resumeTenant(id),
    onSuccess: () => { invalidate(); toast({ type: "success", message: "Cliente reativado." }); },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao reativar." }),
  });
  const deleteM = useMutation({
    mutationFn: () => deleteTenant(id),
    onSuccess: () => {
      setConfirmDelete(false);
      setDeleteConfirm("");
      toast({ type: "success", message: "Cliente excluído." });
      nav("/tenants");
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao excluir cliente." }),
  });
  const rotateM = useMutation({
    mutationFn: () => rotatePassword(id),
    onSuccess: (r) => setRotatedPwd(r.initial_password),
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao trocar a senha." }),
  });
  // Recreate: stops the docker container, removes it, creates a fresh one.
  // Preserves the bind-mounted volume so per-tenant state (sessions,
  // launcher-auth.db, etc.) survives. Needed after image rebuilds OR
  // when env vars (PICOCLAW_AUTH_MODE, ALLOWED_CHANNELS) must refresh.
  const recreateM = useMutation({
    mutationFn: () => recreateTenant(id),
    onSuccess: () => {
      invalidate();
      sanityQuery.refetch();
      toast({ type: "success", message: "Área recriada com as configurações atuais." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao recriar a área." }),
  });
  // Clone: raw volume copy + new LiteLLM key. The cloned launcher-auth.db
  // and all secrets carry over — the new tenant is functionally a twin
  // until the operator rotates credentials.
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSubdomain, setCloneSubdomain] = useState("");
  const [cloneDisplayName, setCloneDisplayName] = useState("");
  const [cloneOwnerEmail, setCloneOwnerEmail] = useState("");
  const [cloneError, setCloneError] = useState("");
  const cloneM = useMutation({
    mutationFn: () =>
      cloneTenant(id, {
        subdomain: cloneSubdomain.trim().toLowerCase(),
        display_name: cloneDisplayName.trim(),
        owner_email: cloneOwnerEmail.trim().toLowerCase(),
      }),
    onSuccess: (r) => {
      setCloneOpen(false);
      setCloneSubdomain("");
      setCloneDisplayName("");
      setCloneOwnerEmail("");
      setCloneError("");
      toast({ type: "success", message: `Cliente copiado: ${r.tenant_id}` });
      nav(`/tenants/${r.tenant_id}`);
    },
    onError: (e: { error?: string }) =>
      setCloneError(e?.error ?? "Falha ao copiar cliente."),
  });
  // Sanity check + magic links list polled in the background. Both are
  // platform-admin-only endpoints; the queries no-op when the user lacks
  // the role (RequirePlatform on the route prevents this page rendering
  // for non-admins anyway).
  const sanityQuery = useQuery({
    queryKey: ["tenant-sanity", id],
    queryFn: () => getTenantSanity(id),
    enabled: !!t.data,
    staleTime: 30_000,
    retry: false,
  });
  const magicLinksQuery = useQuery({
    queryKey: ["tenant-magic-links", id],
    queryFn: () => listTenantMagicLinks(id),
    enabled: !!t.data,
    refetchInterval: 30_000,
  });
  const revokeMagicM = useMutation({
    mutationFn: (nonce: string) => consumeMagicLink(nonce, "Revogado pela equipe."),
    onSuccess: () => {
      magicLinksQuery.refetch();
      toast({ type: "success", message: "Link de acesso revogado." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao revogar." }),
  });
  const magicLinkM = useMutation({
    mutationFn: (roleOverride?: MagicLinkRole) =>
      generateTenantMagicLink(id, undefined, roleOverride ?? magicLinkRole),
    onSuccess: (r) => {
      setMagicLinkData({
        url: r.url,
        expires_at: r.expires_at,
        token: r.token,
        short_magic_link: r.short_magic_link,
        access_link: r.access_link,
        warning: r.warning,
      });
      setMagicLinkConsumed(false);
      setMagicLinkSummary("");
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao gerar link." }),
  });
  // resendCredsM rotates the Supabase password and emails the owner with
  // URL + login + new password + magic link. On success we ALSO get the
  // password and link back so we can show them in a copy-friendly dialog
  // (email could be slow / in spam / Brevo could be down). The toast
  // doubles as confirmation that the email was queued.
  const [resendCredsOpen, setResendCredsOpen] = useState(false);
  const [resendCredsData, setResendCredsData] = useState<{
    sent_to: string;
    dashboard_url: string;
    initial_password: string;
    magic_link: string;
    short_magic_link: string;
    magic_link_in_email: boolean;
  } | null>(null);
  // Copy-feedback state lives inside ResendCredentialsDialog / CopyableField;
  // the page just owns open-state and the response payload.
  const resendCredsM = useMutation({
    mutationFn: () => resendCredentials(id),
    onSuccess: (r) => {
      setResendCredsData({
        sent_to: r.sent_to,
        dashboard_url: r.dashboard_url,
        initial_password: r.initial_password,
        magic_link: r.magic_link,
        short_magic_link: r.short_magic_link,
        magic_link_in_email: r.magic_link_in_email,
      });
      setResendCredsOpen(true);
      toast({
        type: "success",
        message: "Senha rotacionada. Email enviado para " + r.sent_to + ".",
      });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao reenviar credenciais." }),
  });
  const consumeMagicM = useMutation({
    mutationFn: () => {
      // Extract nonce from the token's payload (token format: "<base64Payload>.<sig>")
      if (!magicLinkData?.token) throw new Error("no token");
      const payload = magicLinkData.token.split(".")[0];
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return consumeMagicLink(claims.n, magicLinkSummary);
    },
    onSuccess: () => {
      setMagicLinkConsumed(true);
      toast({ type: "success", message: "Link invalidado. Próximos cliques verão a página de obrigado." });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao concluir link." }),
  });
  const copyMagicLink = async () => {
    if (!magicLinkData) return;
    await navigator.clipboard.writeText(magicLinkData.access_link ?? magicLinkData.short_magic_link ?? magicLinkData.url);
    setMagicLinkCopied(true);
    setTimeout(() => setMagicLinkCopied(false), 2000);
  };
  const closeDeleteDialog = () => {
    if (deleteM.isPending) return;
    setConfirmDelete(false);
    setDeleteConfirm("");
  };

  if (t.isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 h-7 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="grid grid-cols-3 gap-4">
          <Card><SkeletonCard rows={3} /></Card>
          <Card><SkeletonCard rows={4} /></Card>
          <Card><SkeletonCard rows={4} /></Card>
        </div>
      </div>
    );
  }
  if (t.isError || !t.data) return <div className="p-6 text-sm text-red-300">Falha ao carregar cliente.</div>;

  const tenant = t.data;
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";
  const role =
    status.state === "authenticated"
      ? status.me.memberships?.find((m) => m.tenant_id === tenant.id)?.role
      : undefined;
  const canEditConfig = isPlatformAdmin || role === "tenant_owner" || role === "tenant_admin";

  // Budget bar
  const spent = u.data?.summary?.cost_usd ?? 0;
  const budget = tenant.monthly_budget_usd ?? 0;
  const budgetRatio = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const budgetPct = Math.round(budgetRatio * 100);
  const budgetColor =
    budgetPct >= 90 ? "bg-red-500" : budgetPct >= 70 ? "bg-amber-500" : "bg-zinc-600";

  return (
    <div className="mx-auto min-h-full w-full max-w-5xl p-6">
      <Link to="/tenants" className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200">
        <ArrowLeft className="h-3 w-3" /> Voltar para clientes
      </Link>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{tenant.display_name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <StatusBadge status={tenant.status} />
            {tenant.suspended_at && (
              <span className="text-xs text-zinc-500">desde {formatDate(tenant.suspended_at)}</span>
            )}
            <a
              href={`https://${tenant.subdomain}.jotaduo.com`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-zinc-500 hover:text-zinc-200"
            >
              {tenant.subdomain}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-500">{tenant.owner_email}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canEditConfig && (
            <>
              <Link to={`/tenants/${tenant.id}/settings`}>
                <Button variant="outline" size="sm">
                  <Bot className="h-4 w-4" /> Agente
                </Button>
              </Link>
              <Link to={`/tenants/${tenant.id}/skills`}>
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" /> Habilidades
                </Button>
              </Link>
            </>
          )}
          {isPlatformAdmin && (
            <Link to={`/tenants/${tenant.id}/files`}>
              <Button variant="outline" size="sm">
                <FolderTree className="h-4 w-4" /> Arquivos
              </Button>
            </Link>
          )}
          {isPlatformAdmin && (
            <div className="flex items-center gap-1">
              <select
                value={magicLinkRole}
                onChange={(e) => setMagicLinkRole(e.target.value as MagicLinkRole)}
                disabled={magicLinkM.isPending}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                title="Tipo de acesso concedido ao clicar no link."
              >
                <option value="public">Público (visitante)</option>
                <option value="tenant_admin">Administrador (sem senha)</option>
                <option value="tenant_owner">Responsável (sem senha)</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (magicLinkRole !== "public") {
                    const confirmed = confirm(
                      "Você está gerando um link de acesso especial. Qualquer pessoa que receber o link entrará como " +
                        (magicLinkRole === "tenant_owner" ? "responsável" : "administrador") +
                        " até expirar. Continuar?",
                    );
                    if (!confirmed) return;
                  }
                  magicLinkM.mutate(undefined, {
                    onSuccess: () => setMagicLinkOpen(true),
                  });
                }}
                disabled={magicLinkM.isPending}
              >
                <Link2 className="h-4 w-4" />
                {magicLinkM.isPending ? "Gerando..." : "Link de acesso"}
              </Button>
            </div>
          )}
          {isPlatformAdmin && tenant.supabase_user_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  !confirm(
                    "Isto vai gerar uma SENHA NOVA (a anterior deixa de funcionar) e enviar " +
                      "por email para " +
                      (tenant.owner_email || "o responsável") +
                      ", com endereço + email + senha + link de acesso. Continuar?",
                  )
                )
                  return;
                resendCredsM.mutate();
              }}
              disabled={resendCredsM.isPending}
              title="Troca a senha do responsável e envia endereço, email, senha e link de acesso por email."
            >
              <Mail className="h-4 w-4" />
              {resendCredsM.isPending ? "Enviando..." : "Reenviar credenciais"}
            </Button>
          )}
          {isPlatformAdmin && (
            <Link to={`/tenants/${tenant.id}/logs`}>
              <Button variant="outline" size="sm">
                <ScrollText className="h-4 w-4" /> Logs
              </Button>
            </Link>
          )}
          {isPlatformAdmin && tenant.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => suspendM.mutate()} disabled={suspendM.isPending}>
              Suspender
            </Button>
          )}
          {isPlatformAdmin && tenant.status === "suspended" && (
            <Button variant="outline" size="sm" onClick={() => resumeM.mutate()} disabled={resumeM.isPending}>
              Reativar
            </Button>
          )}
          {isPlatformAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    "Isso vai reiniciar a área do cliente com a versão atual.\n\n" +
                      "Mantém os arquivos e aplica novas configurações.\n" +
                      "A área pode ficar indisponível por cerca de 30 segundos.\n\n" +
                      "Continuar?",
                  )
                ) {
                  recreateM.mutate();
                }
              }}
              disabled={recreateM.isPending}
              title="Recria a área mantendo os arquivos"
            >
              {recreateM.isPending ? "Recriando..." : "Recriar área"}
            </Button>
          )}
          {isPlatformAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCloneSubdomain("");
                setCloneDisplayName(tenant.display_name + " (cópia)");
                setCloneOwnerEmail(tenant.owner_email);
                setCloneError("");
                setCloneOpen(true);
              }}
              title="Clone: cópia raw do volume + nova LiteLLM key. Senha e segredos viajam junto."
            >
              Clone
            </Button>
          )}
          {isPlatformAdmin && (
            <>
              <Button variant="secondary" size="sm" onClick={() => rotateM.mutate()} disabled={rotateM.isPending}>
                Trocar senha
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeleteConfirm("");
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Sanity widget: lista verificações pós-clone / pós-recreate. Falha
          ou warn aparece em destaque pra operador agir antes do dono usar. */}
      {isPlatformAdmin && sanityQuery.data && (
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Sanity check
              <button
                onClick={() => sanityQuery.refetch()}
                className="ml-2 text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
                disabled={sanityQuery.isFetching}
              >
                {sanityQuery.isFetching ? "checando..." : "atualizar"}
              </button>
            </div>
            <div className="text-[10px] text-zinc-500">
              {sanityQuery.data.sanity_checks.length} verificações
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sanityQuery.data.sanity_checks.map((c: SanityCheck) => (
              <span
                key={c.name}
                title={c.message || c.status}
                className={
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium " +
                  (c.status === "ok"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : c.status === "warn"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-red-500/15 text-red-300")
                }
              >
                {c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗"} {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {tenant.status === "error" && tenant.last_error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs text-red-300">
          <span className="font-medium text-red-200">Erro:</span> {tenant.last_error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Container</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-zinc-500">ID</span>
              {tenant.container_id
                ? <CopyText value={tenant.container_id} display={tenant.container_id.slice(0, 12)} />
                : <span className="text-zinc-300">—</span>}
            </div>
            <Row label="Memória" value={`${tenant.mem_limit_mb} MB`} />
            <Row label="CPU" value={String(tenant.cpu_quota)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <Row label="Limite/mês" value={formatUSD(tenant.monthly_budget_usd)} />
            {u.data && (
              <>
                <Row label="Spent this period" value={formatUSD(u.data.summary.cost_usd)} />
                {budget > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                      <span>Budget used</span>
                      <span className={budgetPct >= 90 ? "text-red-400" : budgetPct >= 70 ? "text-amber-400" : ""}>
                        {budgetPct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800">
                      <div
                        className={`h-1.5 rounded-full transition-all ${budgetColor}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>
                )}
                <Row label="Tokens enviados" value={formatInt(u.data.summary.prompt_tokens)} />
                <Row label="Tokens recebidos" value={formatInt(u.data.summary.completion_tokens)} />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ciclo de vida</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <Row label="Criado" value={relativeTime(tenant.created_at)} />
            <Row label="Suspenso" value={relativeTime(tenant.suspended_at)} />
            <Row label="Senha entregue" value={tenant.initial_password_delivered ? "sim" : "não"} />
            <Row
              label="CRM"
              value={
                tenant.crm_contact_id != null ? (
                  <a href={`/crm/`} className="text-brand-500 hover:underline" title={`contact #${tenant.crm_contact_id}`}>
                    #{tenant.crm_contact_id}
                  </a>
                ) : (
                  <span className="text-zinc-600">—</span>
                )
              }
            />
          </CardContent>
        </Card>
      </div>

      {isPlatformAdmin && <TenantModelRoutingCard tenantId={tenant.id} />}

      {isPlatformAdmin && tenant.is_public && (
        <div className="mt-4">
          <PromoteTenantCard tenant={tenant} />
        </div>
      )}

      {isPlatformAdmin && tenant.workspace_id && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Modelo base</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <Row label="Modelo" value={tenant.workspace_id} />
            <Row label="Versão aplicada" value={tenant.workspace_version_applied ?? "—"} />
            <p className="mt-2 text-[11px] text-zinc-500">
              A versão aplicada é a revisão DB gravada na criação. A sincronização
              real do modelo com o git deployado aparece por hash em{" "}
              <Link to="/workspaces" className="underline">
                /workspaces
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {isPlatformAdmin && (
        <CRMSection tenantId={id} tenant={tenant} onLinked={() => qc.invalidateQueries({ queryKey: ["tenant", id] })} />
      )}

      {/* Members section */}
      <MembersSection tenantId={id} canManage={isPlatformAdmin || role === "tenant_owner"} />

      {/* Magic links list: every active link visible at a glance + revoke
          per row. Critical for spotting a leaked owner-grade link, which
          today the operator would only know about by tail'ing audit_logs. */}
      {isPlatformAdmin && magicLinksQuery.data && magicLinksQuery.data.links.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">
            Links de acesso
            <span className="ml-2 text-xs font-normal text-zinc-500">
              ({magicLinksQuery.data.links.filter((l) => l.active).length} ativos /{" "}
              {magicLinksQuery.data.links.length} total)
            </span>
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Nonce</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-3 py-2 font-medium">Expira</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {magicLinksQuery.data.links.map((m) => (
                  <tr key={m.nonce} className={m.active ? "" : "opacity-60"}>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{m.nonce}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500" title={formatDate(m.created_at)}>
                      {relativeTime(m.created_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500" title={formatDate(m.expires_at)}>
                      {relativeTime(m.expires_at)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {m.active ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                          ativo
                        </span>
                      ) : m.consumed_at ? (
                        <span
                          className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-zinc-400"
                          title={`Consumido ${formatDate(m.consumed_at)}`}
                        >
                          consumido
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-zinc-400">
                          expirado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {m.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              confirm(
                                "Revogar este link de acesso?\n\nQuem clicar depois disso verá a página de obrigado em vez da área do cliente.",
                              )
                            ) {
                              revokeMagicM.mutate(m.nonce);
                            }
                          }}
                          disabled={revokeMagicM.isPending}
                          className="text-xs text-amber-300 hover:text-amber-200"
                        >
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent usage */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-300">Recent usage</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">From</label>
            <input
              type="date"
              value={usageFrom}
              onChange={(e) => setUsageFrom(e.target.value)}
              className="h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
            <label className="text-xs text-zinc-500">To</label>
            <input
              type="date"
              value={usageTo}
              onChange={(e) => setUsageTo(e.target.value)}
              className="h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/80 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium text-right">Prompt</th>
                <th className="px-3 py-2 font-medium text-right">Completion</th>
                <th className="px-3 py-2 font-medium text-right">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {(u.data?.recent ?? []).map((r) => (
                <tr key={r.ID} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-1.5 text-zinc-400">{relativeTime(r.Timestamp)}</td>
                  <td className="px-3 py-1.5 font-mono text-zinc-200">{r.Model}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{r.Provider}</td>
                  <td className="px-3 py-1.5 text-right">{formatInt(r.PromptTokens)}</td>
                  <td className="px-3 py-1.5 text-right">{formatInt(r.CompletionTokens)}</td>
                  <td className="px-3 py-1.5 text-right">{formatUSD(r.CostUSD)}</td>
                </tr>
              ))}
              {(u.data?.recent?.length ?? 0) === 0 && !u.isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">Sem uso ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={confirmDelete} onClose={closeDeleteDialog} title="Excluir cliente?" size="sm" closable={!deleteM.isPending}>
        <div className="space-y-4 text-sm">
          <p className="text-zinc-300">
            Isso remove a área do cliente, os arquivos vinculados e os registros da Jota Duo relacionados.
          </p>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Digite {tenant.subdomain}</label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-red-500"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteM.isPending}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => deleteM.mutate()}
              disabled={deleteConfirm !== tenant.subdomain || deleteM.isPending}
            >
              {deleteM.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </Dialog>

      <RotatedPasswordDialog password={rotatedPwd} onClose={() => setRotatedPwd(null)} />

      <ResendCredentialsDialog
        open={resendCredsOpen}
        onClose={() => setResendCredsOpen(false)}
        data={resendCredsData}
      />

      <Dialog
        open={magicLinkOpen}
        onClose={() => setMagicLinkOpen(false)}
        title="Link de acesso direto"
        size="md"
      >
        <div className="space-y-4 text-sm">
          {mintedMagicRole !== "public" && (
            <div className="rounded-md border border-red-700/60 bg-red-950/40 p-3 text-xs text-red-200">
              <div className="mb-1 text-sm font-semibold">
                Link de acesso especial
              </div>
              Qualquer pessoa que clicar entra como{" "}
              {mintedMagicRole === "tenant_owner" ? "responsável" : "administrador"} até expirar.
              Não publique em canal público. Quando terminar de usar, clique em
              <b> "Concluir agora"</b> abaixo para revogar imediatamente.
            </div>
          )}
          <p className="text-zinc-300">
            {mintedMagicRole === "public"
              ? "Compartilhe esse link com o contato. Ao clicar, ele entra direto no atendimento, sem email e sem senha."
              : "Use esse link para entrar como " +
                (mintedMagicRole === "tenant_owner" ? "responsável" : "administrador") +
                " sem precisar de senha."}{" "}
            O link expira no horário abaixo; depois disso, a pessoa volta para a tela de acesso normal.
          </p>
          {magicLinkData && (
            <>
              {magicLinkData.warning && (
                <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-300">
                  {magicLinkData.warning}
                </div>
              )}
              <CopyableField
                label="Link recomendado"
                value={magicLinkData.access_link ?? magicLinkData.short_magic_link ?? magicLinkData.url}
                accent="emerald"
                variant="tight"
                hint="O link curto é usado automaticamente quando está disponível."
              />
              {magicLinkData.short_magic_link && magicLinkData.short_magic_link !== magicLinkData.url && (
                <CopyableField label="Link de acesso completo" value={magicLinkData.url} variant="tight" />
              )}
              <Button size="sm" variant="outline" onClick={copyMagicLink} className="w-fit">
                {magicLinkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {magicLinkCopied ? "Copiado" : "Copiar link recomendado"}
              </Button>
              <div className="text-xs text-zinc-400">
                Expira em <b>{new Date(magicLinkData.expires_at).toLocaleString("pt-BR")}</b>.
                Quem tiver o link consegue entrar até esse horário. Para bloquear antes,
                use a ação de revogar abaixo.
              </div>
              <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-300">
                Trate como um link privado: não publique em canal aberto.
              </div>

              <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-900/50 p-3 text-xs">
                <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-200">Invalidar quando a conversa terminar</div>
                {magicLinkConsumed && <span className="text-[10px] text-emerald-400">✓ link invalidado</span>}
              </div>
              <p className="text-zinc-400">
                  Use o botão abaixo para fechar este link agora. Depois disso, quem clicar verá a
                  tela de "obrigado, em breve entramos em contato"; opcionalmente personalize o
                  resumo exibido ao visitante.
              </p>
                <Textarea
                  value={magicLinkSummary}
                  onChange={(e) => setMagicLinkSummary(e.target.value)}
                  placeholder="Resumo exibido ao visitante (opcional). Ex: Recebemos suas informações sobre a empresa X. Em até 24h um especialista vai te contatar pelo email Y."
                  rows={3}
                  disabled={magicLinkConsumed}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant={mintedMagicRole !== "public" && !magicLinkConsumed ? "danger" : "outline"}
                    onClick={() => consumeMagicM.mutate()}
                    disabled={consumeMagicM.isPending || magicLinkConsumed}
                  >
                    {consumeMagicM.isPending
                      ? "Invalidando..."
                      : magicLinkConsumed
                      ? "Link invalidado ✓"
                      : "Concluir agora (invalidar link)"}
                  </Button>
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMagicLinkOpen(false)}>Fechar</Button>
            <Button onClick={() => magicLinkM.mutate(undefined)} disabled={magicLinkM.isPending}>
              {magicLinkM.isPending ? "Gerando..." : "Gerar outro"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Clone tenant dialog: minta um clone raw da volume + nova LiteLLM key.
          Senha, segredos e dashboard auth carregam junto — operador rotaciona
          se quiser separar o clone do original. */}
      <Dialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        title={`Clone de ${tenant.subdomain}`}
        size="md"
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            <div className="mb-1 font-semibold">Cópia completa</div>
            Os arquivos e acessos da área atual serão copiados para um novo cliente.
            Troque a senha depois se o responsável final for diferente.
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
              Endereço curto da cópia
            </label>
            <Input
              value={cloneSubdomain}
              onChange={(e) => setCloneSubdomain(e.target.value)}
              placeholder="cliente-clone"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
              Nome do cliente
            </label>
            <Input
              value={cloneDisplayName}
              onChange={(e) => setCloneDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
              Email do responsável
            </label>
            <Input
              value={cloneOwnerEmail}
              onChange={(e) => setCloneOwnerEmail(e.target.value)}
              placeholder="dono@empresa.com"
            />
          </div>
          {cloneError && (
            <div className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
              {cloneError}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={cloneM.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setCloneError("");
                cloneM.mutate();
              }}
              disabled={
                cloneM.isPending ||
                !cloneSubdomain.trim() ||
                !cloneDisplayName.trim() ||
                !cloneOwnerEmail.trim()
              }
            >
              {cloneM.isPending ? "Copiando..." : "Copiar cliente"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

type CLIOrderPreset = "claude-codex" | "codex-claude" | "claude" | "codex";

function cliOrderFromPreset(value: CLIOrderPreset): TenantCLIProvider[] {
  switch (value) {
    case "codex-claude":
      return ["codex-cli", "claude-cli"];
    case "claude":
      return ["claude-cli"];
    case "codex":
      return ["codex-cli"];
    default:
      return ["claude-cli", "codex-cli"];
  }
}

function presetFromCLIOrder(order: TenantCLIProvider[] | undefined): CLIOrderPreset {
  const value = (order ?? []).join(",");
  switch (value) {
    case "codex-cli,claude-cli":
      return "codex-claude";
    case "claude-cli":
      return "claude";
    case "codex-cli":
      return "codex";
    default:
      return "claude-codex";
  }
}

function TenantModelRoutingCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ["tenant-model-routing", tenantId],
    queryFn: () => getTenantModelRouting(tenantId),
  });
  const [mode, setMode] = useState<TenantModelRoutingMode>("auto");
  const [litellmModelName, setLiteLLMModelName] = useState(DEFAULT_LITELLM_MODEL_NAME);
  const [litellmAPIBase, setLiteLLMAPIBase] = useState("");
  const [litellmFallbacks, setLiteLLMFallbacks] = useState<string[]>(() => [
    ...DEFAULT_LITELLM_FALLBACKS,
  ]);
  const [litellmAllowedModels, setLiteLLMAllowedModels] = useState<string[]>([]);
  const [cliOrderPreset, setCLIOrderPreset] = useState<CLIOrderPreset>("claude-codex");
  const [claudeCLIModelPreset, setClaudeCLIModelPreset] = useState("sonnet");
  const [claudeCLICustomModel, setClaudeCLICustomModel] = useState("");
  const [codexCLIModelPreset, setCodexCLIModelPreset] = useState("codex-cli");
  const [codexCLICustomModel, setCodexCLICustomModel] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setMode(q.data.mode);
    setLiteLLMModelName(q.data.litellm?.model_name || DEFAULT_LITELLM_MODEL_NAME);
    setLiteLLMAPIBase(q.data.litellm?.api_base || "");
    {
      const storedFallbacks = normalizeModelList(q.data.litellm?.fallbacks);
      setLiteLLMFallbacks(
        storedFallbacks.length > 0 ? storedFallbacks : [...DEFAULT_LITELLM_FALLBACKS],
      );
    }
    setLiteLLMAllowedModels(normalizeModelList(q.data.litellm?.allowed_models));
    setCLIOrderPreset(presetFromCLIOrder(q.data.cli?.order));
    const claudeModel = q.data.cli?.claude_model || "sonnet";
    const claudePresetID = cliPresetIDForModel(claudeModel, CLAUDE_CLI_MODEL_PRESETS, "sonnet");
    setClaudeCLIModelPreset(claudePresetID);
    setClaudeCLICustomModel(
      claudePresetID === CUSTOM_CLI_MODEL_PRESET_ID ? claudeModel : "",
    );
    const codexModel = q.data.cli?.codex_model || "codex-cli";
    const codexPresetID = cliPresetIDForModel(codexModel, CODEX_CLI_MODEL_PRESETS, "codex-cli");
    setCodexCLIModelPreset(codexPresetID);
    setCodexCLICustomModel(codexPresetID === CUSTOM_CLI_MODEL_PRESET_ID ? codexModel : "");
  }, [q.data]);

  const litellmModelsQ = useQuery({
    queryKey: ["platform-litellm-models"],
    queryFn: listPlatformLiteLLMModels,
    enabled: mode === "litellm",
    staleTime: 30_000,
    retry: false,
  });
  const litellmModels = litellmModelsQ.data?.models ?? [];

  const updateM = useMutation({
    mutationFn: () => updateTenantModelRouting(tenantId, buildTenantModelRoutingInput()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-model-routing", tenantId] });
      qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
      toast({ type: "success", message: "Roteamento salvo e área recriada." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao atualizar roteamento." }),
  });

  function buildTenantModelRoutingInput(): TenantModelRoutingInput {
    if (mode === "litellm") {
      return {
        mode,
        litellm: {
          model_name: litellmModelName.trim() || undefined,
          api_base: litellmAPIBase.trim() || undefined,
          fallbacks: normalizeModelList(litellmFallbacks),
          allowed_models: normalizeModelList(litellmAllowedModels),
        },
      };
    }
    if (mode === "cli") {
      const claudeCLIModel = cliModelValueFromPreset(
        claudeCLIModelPreset,
        claudeCLICustomModel,
        CLAUDE_CLI_MODEL_PRESETS,
      );
      const codexCLIModel = cliModelValueFromPreset(
        codexCLIModelPreset,
        codexCLICustomModel,
        CODEX_CLI_MODEL_PRESETS,
      );
      return {
        mode,
        cli: {
          order: cliOrderFromPreset(cliOrderPreset),
          claude_model: claudeCLIModel.trim() || undefined,
          codex_model: codexCLIModel.trim() || undefined,
        },
      };
    }
    return { mode: "auto" };
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Roteamento de modelo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {q.isError ? (
          <div className="rounded border border-red-900/50 bg-red-950/30 p-3 text-red-300">
            {(q.error as { error?: string })?.error ?? "Falha ao carregar roteamento."}
          </div>
        ) : null}
        <div className="grid gap-4 border-b border-zinc-800 pb-4 md:grid-cols-3">
          <Field>
            <FieldLabel>Origem</FieldLabel>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as TenantModelRoutingMode)}
              disabled={q.isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="litellm">LiteLLM</SelectItem>
                <SelectItem value="cli">CLIs compartilhados</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Salvar recria a área e aplica o config.json materializado.</FieldDescription>
          </Field>

          {mode === "cli" ? (
            <>
              <Field>
                <FieldLabel>Ordem dos CLIs</FieldLabel>
                <Select
                  value={cliOrderPreset}
                  onValueChange={(value) => setCLIOrderPreset(value as CLIOrderPreset)}
                  disabled={q.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-codex">Claude CLI → Codex CLI</SelectItem>
                    <SelectItem value="codex-claude">Codex CLI → Claude CLI</SelectItem>
                    <SelectItem value="claude">Somente Claude CLI</SelectItem>
                    <SelectItem value="codex">Somente Codex CLI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-claude-cli-model">Modelo Claude CLI</FieldLabel>
                <Select
                  value={claudeCLIModelPreset}
                  onValueChange={setClaudeCLIModelPreset}
                  disabled={q.isLoading}
                >
                  <SelectTrigger id="tenant-claude-cli-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAUDE_CLI_MODEL_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label} · {preset.model}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {claudeCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID ? (
                  <Input
                    id="tenant-claude-cli-custom-model"
                    value={claudeCLICustomModel}
                    onChange={(event) => setClaudeCLICustomModel(event.target.value)}
                    placeholder="claude-sonnet-4-6"
                    disabled={q.isLoading}
                  />
                ) : null}
                <FieldDescription>
                  {cliPresetDescription(claudeCLIModelPreset, CLAUDE_CLI_MODEL_PRESETS)}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-codex-cli-model">Modelo Codex CLI</FieldLabel>
                <Select
                  value={codexCLIModelPreset}
                  onValueChange={setCodexCLIModelPreset}
                  disabled={q.isLoading}
                >
                  <SelectTrigger id="tenant-codex-cli-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODEX_CLI_MODEL_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label} · {preset.model}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {codexCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID ? (
                  <Input
                    id="tenant-codex-cli-custom-model"
                    value={codexCLICustomModel}
                    onChange={(event) => setCodexCLICustomModel(event.target.value)}
                    placeholder="gpt-5.5"
                    disabled={q.isLoading}
                  />
                ) : null}
                <FieldDescription>
                  {cliPresetDescription(codexCLIModelPreset, CODEX_CLI_MODEL_PRESETS)}
                </FieldDescription>
              </Field>
            </>
          ) : null}

          {mode === "litellm" ? (
            <>
              {litellmModelsQ.isError ? (
                <div className="md:col-span-3 rounded border border-red-900/50 bg-red-950/30 p-3 text-red-300">
                  {(litellmModelsQ.error as { error?: string })?.error ??
                    "Falha ao carregar modelos cadastrados no LiteLLM."}
                </div>
              ) : null}
              <Field>
                <FieldLabel htmlFor="tenant-litellm-model">Modelo principal</FieldLabel>
                <LiteLLMModelSelect
                  id="tenant-litellm-model"
                  value={litellmModelName}
                  onChange={(next) => {
                    setLiteLLMModelName(next);
                    setLiteLLMFallbacks((current) => removeModelName(current, next));
                  }}
                  models={litellmModels}
                  placeholder={DEFAULT_LITELLM_MODEL_NAME}
                  disabled={q.isLoading}
                  loading={litellmModelsQ.isLoading}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-litellm-api-base">API base</FieldLabel>
                <Input
                  id="tenant-litellm-api-base"
                  value={litellmAPIBase}
                  onChange={(event) => setLiteLLMAPIBase(event.target.value)}
                  placeholder="Usar LiteLLM global"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tenant-litellm-fallbacks">Fallbacks</FieldLabel>
                <LiteLLMModelMultiSelect
                  id="tenant-litellm-fallbacks"
                  value={litellmFallbacks}
                  onChange={setLiteLLMFallbacks}
                  models={litellmModels}
                  placeholder="Adicionar fallback"
                  emptyText="Nenhum fallback selecionado"
                  exclude={[litellmModelName]}
                  disabled={q.isLoading}
                  loading={litellmModelsQ.isLoading}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="tenant-litellm-allowed">Modelos liberados na chave</FieldLabel>
                <LiteLLMModelMultiSelect
                  id="tenant-litellm-allowed"
                  value={litellmAllowedModels}
                  onChange={setLiteLLMAllowedModels}
                  models={litellmModels}
                  placeholder="Adicionar modelo liberado"
                  emptyText="Vazio = principal + fallbacks"
                  disabled={q.isLoading}
                  loading={litellmModelsQ.isLoading}
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            A área pode ficar indisponível por alguns segundos durante a recriação.
          </p>
          <Button
            onClick={() => {
              if (
                confirm(
                  "Salvar o roteamento e recriar a área agora?\n\nA área do cliente pode ficar indisponível por alguns segundos.",
                )
              ) {
                updateM.mutate();
              }
            }}
            disabled={q.isLoading || updateM.isPending}
          >
            {updateM.isPending ? "Salvando..." : "Salvar e recriar área"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Members Section ──────────────────────────────────────────────────────────

type MemberRole = "tenant_owner" | "tenant_admin" | "operator" | "viewer";
const ROLE_OPTIONS: MemberRole[] = ["tenant_owner", "tenant_admin", "operator", "viewer"];

function MembersSection({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const membersQ = useQuery({
    queryKey: ["members", tenantId],
    queryFn: () => listMembers(tenantId),
    enabled: canManage,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("operator");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const inviteM = useMutation({
    mutationFn: () => createInvite(tenantId, email.trim(), role),
    onSuccess: (r) => {
      setInviteToken(r.token);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["members", tenantId] });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to create invite." }),
  });

  const copyToken = async () => {
    if (!inviteToken) return;
    await navigator.clipboard.writeText(inviteToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 1500);
  };

  if (!canManage) return null;

  const members = membersQ.data?.members ?? [];

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-300">Equipe</h2>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900/80 text-left text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Acesso</th>
              <th className="px-3 py-2 font-medium">Desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {membersQ.isLoading && (
              <tr><td colSpan={3} className="px-3 py-3 text-center text-zinc-600">Carregando...</td></tr>
            )}
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-1.5 text-zinc-300">{m.email}</td>
                <td className="px-3 py-1.5 text-zinc-500">{m.role}</td>
                <td className="px-3 py-1.5 text-zinc-600">{relativeTime(m.created_at)}</td>
              </tr>
            ))}
            {!membersQ.isLoading && members.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-3 text-center text-zinc-600">Nenhum membro ainda.</td></tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-zinc-800 bg-zinc-950/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none"
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Button size="sm" onClick={() => inviteM.mutate()} disabled={!email.trim() || inviteM.isPending}>
              {inviteM.isPending ? "Convidando..." : "Convidar"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!inviteToken} onClose={() => setInviteToken(null)} title="Link de convite" size="md">
        <div className="space-y-3 text-sm">
          <p className="text-amber-300">Compartilhe este código agora: ele não será exibido novamente.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
              {inviteToken}
            </code>
            <Button variant="secondary" size="icon" onClick={copyToken}>
              {tokenCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setInviteToken(null)}>Fechar</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ── CRM Section ──────────────────────────────────────────────────────────────

type CRMSectionProps = {
  tenantId: string;
  tenant: { crm_contact_id?: number | null; display_name: string; owner_email: string };
  onLinked: () => void;
};

function CRMSection({ tenantId, tenant, onLinked }: CRMSectionProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const contactId = tenant.crm_contact_id ?? null;

  const contactQ = useQuery({
    queryKey: ["crm-contact", contactId],
    queryFn: () => getCRMContact(contactId!),
    enabled: contactId != null,
  });

  const dealsQ = useQuery({
    queryKey: ["crm-deals", contactId],
    queryFn: () => listContactDeals(contactId!),
    enabled: contactId != null,
  });

  const [newDeal, setNewDeal] = useState(false);
  const [dealName, setDealName] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealStage, setDealStage] = useState("prospect");

  const linkM = useMutation({
    mutationFn: async () => {
      const parts = tenant.display_name.trim().split(/\s+/);
      const firstName = parts[0] ?? tenant.display_name;
      const lastName = parts.slice(1).join(" ") || undefined;
      const { contact } = await createCRMContact({ first_name: firstName, last_name: lastName, email: tenant.owner_email });
      await setCRMLinks(tenantId, { contact_id: contact.id });
      return contact;
    },
    onSuccess: () => {
      onLinked();
      qc.invalidateQueries({ queryKey: ["crm-contact"] });
      toast({ type: "success", message: "Contato criado e vinculado." });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao criar contato." }),
  });

  const dealM = useMutation({
    mutationFn: () =>
      createCRMDeal({
        name: dealName,
        contact_id: contactId!,
        value: dealValue ? parseFloat(dealValue) : undefined,
        stage: dealStage,
      }),
    onSuccess: () => {
      setNewDeal(false);
      setDealName("");
      setDealValue("");
      setDealStage("prospect");
      qc.invalidateQueries({ queryKey: ["crm-deals", contactId] });
      toast({ type: "success", message: "Negócio criado." });
    },
  });

  const contact = contactQ.data?.contact;
  const deals = dealsQ.data?.deals ?? [];
  const totalValue = dealsQ.data?.totalValue ?? 0;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">CRM</h2>
        <a href="/crm/" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          Open CRM <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {contactId == null ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
          <span className="flex-1 text-sm text-zinc-500">Nenhum contato vinculado a este cliente.</span>
          <Button variant="outline" size="sm" onClick={() => linkM.mutate()} disabled={linkM.isPending}>
            {linkM.isPending ? "Creating…" : "Create CRM contact"}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="text-xs">
              {contactQ.isLoading && <span className="text-zinc-500">Loading…</span>}
              {contact && (
                <>
                  <Row label="Name" value={`${contact.first_name} ${contact.last_name}`.trim() || "—"} />
                  <Row label="Email" value={contact.email || "—"} />
                  <Row label="Status" value={contact.status || "—"} />
                  {contact.title && <Row label="Title" value={contact.title} />}
                  {contact.company_name && <Row label="Company" value={contact.company_name} />}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Deals</span>
                <div className="flex items-center gap-3">
                  {totalValue > 0 && (
                    <span className="text-xs font-normal text-zinc-400">{formatUSD(totalValue)} total</span>
                  )}
                  <button
                    onClick={() => setNewDeal(true)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100"
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> New deal
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900/50 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Deal</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium text-right">Value</th>
                    <th className="px-3 py-2 font-medium">Close</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {deals.map((d) => (
                    <tr key={d.id} className="hover:bg-zinc-900/40">
                      <td className="px-3 py-1.5 text-zinc-200">{d.name}</td>
                      <td className={`px-3 py-1.5 ${STAGE_COLOR[d.stage] ?? "text-zinc-400"}`}>
                        {STAGE_LABEL[d.stage] ?? d.stage}
                      </td>
                      <td className="px-3 py-1.5 text-right">{d.value ? formatUSD(d.value) : "—"}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{formatDate(d.close_date)}</td>
                    </tr>
                  ))}
                  {deals.length === 0 && !dealsQ.isLoading && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">No deals yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={newDeal} onClose={() => setNewDeal(false)} title="New deal" size="sm">
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Deal name</label>
            <input
              className="w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-brand-500"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              placeholder="e.g. Annual subscription"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Value (USD)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-brand-500"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Stage</label>
              <select
                className="w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-brand-500"
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value)}
              >
                {Object.entries(STAGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setNewDeal(false)}>Cancel</Button>
            <Button onClick={() => dealM.mutate()} disabled={!dealName.trim() || dealM.isPending}>
              {dealM.isPending ? "Saving…" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}
