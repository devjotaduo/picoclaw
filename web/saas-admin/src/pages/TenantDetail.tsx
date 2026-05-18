import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Check, Sparkles, Bot, ExternalLink, PlusCircle, ScrollText } from "lucide-react";
import {
  getTenant,
  getUsage,
  suspendTenant,
  resumeTenant,
  deleteTenant,
  applyLauncherProfile,
  rotatePassword,
  setCRMLinks,
  listMembers,
  createInvite,
} from "@/api/tenants";
import { listLauncherProfiles } from "@/api/launcher-profiles";
import {
  getCRMContact,
  listContactDeals,
  createCRMContact,
  createCRMDeal,
  STAGE_LABEL,
  STAGE_COLOR,
} from "@/api/crm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { CopyText } from "@/components/ui/copy-text";
import { SkeletonCard } from "@/components/ui/skeleton";
import { formatDate, formatInt, formatUSD, relativeTime } from "@/lib/utils";
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
  const profilesQ = useQuery({
    queryKey: ["launcher-profiles"],
    queryFn: listLauncherProfiles,
    enabled: status.state === "authenticated" && status.me.platform_role === "platform_admin",
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [rotatedPwd, setRotatedPwd] = useState<string | null>(null);
  const [pwdCopied, setPwdCopied] = useState(false);
  const [applyProfileId, setApplyProfileId] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", id] });

  const suspendM = useMutation({
    mutationFn: () => suspendTenant(id),
    onSuccess: () => { invalidate(); toast({ type: "info", message: "Tenant suspended." }); },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to suspend." }),
  });
  const resumeM = useMutation({
    mutationFn: () => resumeTenant(id),
    onSuccess: () => { invalidate(); toast({ type: "success", message: "Tenant resumed." }); },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to resume." }),
  });
  const deleteM = useMutation({
    mutationFn: () => deleteTenant(id),
    onSuccess: () => {
      setConfirmDelete(false);
      setDeleteConfirm("");
      toast({ type: "success", message: "Tenant deleted." });
      nav("/tenants");
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to delete tenant." }),
  });
  const rotateM = useMutation({
    mutationFn: () => rotatePassword(id),
    onSuccess: (r) => setRotatedPwd(r.initial_password),
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to rotate password." }),
  });
  const applyProfileM = useMutation({
    mutationFn: (profileId: string) => applyLauncherProfile(id, profileId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenant", id] });
      await qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
      toast({ type: "success", message: "Profile applied." });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to apply profile." }),
  });

  const copyPwd = async () => {
    if (!rotatedPwd) return;
    await navigator.clipboard.writeText(rotatedPwd);
    setPwdCopied(true);
    setTimeout(() => setPwdCopied(false), 1500);
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
  if (t.isError || !t.data) return <div className="p-6 text-sm text-red-300">Failed to load tenant.</div>;

  const tenant = t.data;
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";
  const role =
    status.state === "authenticated"
      ? status.me.memberships.find((m) => m.tenant_id === tenant.id)?.role
      : undefined;
  const canEditConfig = isPlatformAdmin || role === "tenant_owner" || role === "tenant_admin";
  const profiles = profilesQ.data?.profiles ?? [];
  const currentProfile = profiles.find((profile) => profile.id === tenant.launcher_profile_id);
  const selectedProfileId =
    applyProfileId || tenant.launcher_profile_id || profiles.find((profile) => profile.is_default)?.id || "";

  // Budget bar
  const spent = u.data?.summary?.cost_usd ?? 0;
  const budget = tenant.monthly_budget_usd ?? 0;
  const budgetRatio = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const budgetPct = Math.round(budgetRatio * 100);
  const budgetColor =
    budgetPct >= 90 ? "bg-red-500" : budgetPct >= 70 ? "bg-amber-500" : "bg-zinc-600";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link to="/tenants" className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200">
        <ArrowLeft className="h-3 w-3" /> Back to tenants
      </Link>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{tenant.display_name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <StatusBadge status={tenant.status} />
            {tenant.suspended_at && (
              <span className="text-xs text-zinc-500">since {formatDate(tenant.suspended_at)}</span>
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
                  <Bot className="h-4 w-4" /> Agent
                </Button>
              </Link>
              <Link to={`/tenants/${tenant.id}/skills`}>
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4" /> Skills
                </Button>
              </Link>
            </>
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
              Suspend
            </Button>
          )}
          {isPlatformAdmin && tenant.status === "suspended" && (
            <Button variant="outline" size="sm" onClick={() => resumeM.mutate()} disabled={resumeM.isPending}>
              Resume
            </Button>
          )}
          {isPlatformAdmin && (
            <>
              <Button variant="secondary" size="sm" onClick={() => rotateM.mutate()} disabled={rotateM.isPending}>
                Rotate password
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

      {tenant.status === "error" && tenant.last_error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs text-red-300">
          <span className="font-medium text-red-200">Error:</span> {tenant.last_error}
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
            <Row label="Memory" value={`${tenant.mem_limit_mb} MB`} />
            <Row label="CPU" value={String(tenant.cpu_quota)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <Row label="Budget/mo" value={formatUSD(tenant.monthly_budget_usd)} />
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
                <Row label="Tokens (prompt)" value={formatInt(u.data.summary.prompt_tokens)} />
                <Row label="Tokens (completion)" value={formatInt(u.data.summary.completion_tokens)} />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <Row label="Created" value={relativeTime(tenant.created_at)} />
            <Row label="Suspended" value={relativeTime(tenant.suspended_at)} />
            <Row label="Pwd delivered" value={tenant.initial_password_delivered ? "yes" : "no"} />
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

      {isPlatformAdmin && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Launcher profile</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-[1fr_auto] gap-3 text-xs">
            <div>
              <Row label="Applied" value={currentProfile?.name ?? tenant.launcher_profile_id ?? "—"} />
              <Row label="Version" value={tenant.launcher_profile_version_applied ?? "—"} />
            </div>
            <div className="flex items-end gap-2">
              <select
                value={selectedProfileId}
                onChange={(e) => setApplyProfileId(e.target.value)}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
              >
                <option value="">Choose profile</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · v{profile.version}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => selectedProfileId && applyProfileM.mutate(selectedProfileId)}
                disabled={!selectedProfileId || applyProfileM.isPending}
              >
                {applyProfileM.isPending ? "Applying…" : "Apply profile"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPlatformAdmin && (
        <CRMSection tenantId={id} tenant={tenant} onLinked={() => qc.invalidateQueries({ queryKey: ["tenant", id] })} />
      )}

      {/* Members section */}
      <MembersSection tenantId={id} canManage={isPlatformAdmin || role === "tenant_owner"} />

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
                <th className="px-3 py-2 font-medium text-right">Cost</th>
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
                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">No usage yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={confirmDelete} onClose={closeDeleteDialog} title="Delete tenant?" size="sm" closable={!deleteM.isPending}>
        <div className="space-y-4 text-sm">
          <p className="text-zinc-300">
            This removes the Docker container, LiteLLM key, tenant volume, and related Picoclaw database records.
          </p>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Type {tenant.subdomain}</label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-red-500"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteM.isPending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => deleteM.mutate()}
              disabled={deleteConfirm !== tenant.subdomain || deleteM.isPending}
            >
              {deleteM.isPending ? "Deleting…" : "Delete forever"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!rotatedPwd} onClose={() => setRotatedPwd(null)} title="New password" size="md" closable={false}>
        {rotatedPwd && (
          <div className="space-y-3 text-sm">
            <p className="text-amber-300">Save this password now — it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                {rotatedPwd}
              </code>
              <Button variant="secondary" size="icon" onClick={copyPwd}>
                {pwdCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setRotatedPwd(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
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
      <h2 className="mb-2 text-sm font-semibold text-zinc-300">Members</h2>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900/80 text-left text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {membersQ.isLoading && (
              <tr><td colSpan={3} className="px-3 py-3 text-center text-zinc-600">Loading…</td></tr>
            )}
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-1.5 text-zinc-300">{m.email}</td>
                <td className="px-3 py-1.5 text-zinc-500">{m.role}</td>
                <td className="px-3 py-1.5 text-zinc-600">{relativeTime(m.created_at)}</td>
              </tr>
            ))}
            {!membersQ.isLoading && members.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-3 text-center text-zinc-600">No members yet.</td></tr>
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
              {inviteM.isPending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!inviteToken} onClose={() => setInviteToken(null)} title="Invite link" size="md" closable={false}>
        <div className="space-y-3 text-sm">
          <p className="text-amber-300">Share this token once — it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
              {inviteToken}
            </code>
            <Button variant="secondary" size="icon" onClick={copyToken}>
              {tokenCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setInviteToken(null)}>Done</Button>
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
      toast({ type: "success", message: "CRM contact created and linked." });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Failed to create CRM contact." }),
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
      toast({ type: "success", message: "Deal created." });
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
          <span className="flex-1 text-sm text-zinc-500">No CRM contact linked to this tenant.</span>
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
