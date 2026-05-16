import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Loader2 } from "lucide-react";
import { createTenant, getTenant, markPasswordDelivered, type CreateTenantInput, type CreateTenantResponse } from "@/api/tenants";
import { listLauncherProfiles } from "@/api/launcher-profiles";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

export function NewTenant() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTenantInput>({
    display_name: "",
    owner_email: "",
    subdomain: "",
    monthly_budget_usd: 5,
    mem_limit_mb: 512,
    cpu_quota: 0.5,
  });
  const [result, setResult] = useState<CreateTenantResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const profilesQ = useQuery({ queryKey: ["launcher-profiles"], queryFn: listLauncherProfiles });
  const profiles = profilesQ.data?.profiles ?? [];

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

  const errMsg = (() => {
    const e = m.error as unknown;
    if (!e) return null;
    if (typeof e === "object" && e !== null && "error" in e) return String((e as { error: unknown }).error);
    return "request failed";
  })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(form);
  };

  const copyPwd = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.initial_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const markDelivered = async () => {
    if (!result) return;
    await markPasswordDelivered(result.tenant_id);
    nav(`/tenants/${result.tenant_id}`);
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-semibold">New tenant</h1>

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input
            id="display_name"
            required
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="owner_email">Owner email</Label>
          <Input
            id="owner_email"
            type="email"
            required
            value={form.owner_email}
            onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="subdomain">Subdomain (lowercase, 3–30 chars)</Label>
          <Input
            id="subdomain"
            required
            pattern="^[a-z0-9](-?[a-z0-9])*$"
            minLength={3}
            maxLength={30}
            value={form.subdomain}
            onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })}
          />
        </div>
        <div>
          <Label htmlFor="launcher_profile_id">Launcher profile</Label>
          <select
            id="launcher_profile_id"
            value={form.launcher_profile_id ?? ""}
            onChange={(e) => setForm({ ...form, launcher_profile_id: e.target.value || undefined })}
            className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-100"
          >
            <option value="">Default profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}{profile.is_default ? " (default)" : ""} · v{profile.version}
              </option>
            ))}
          </select>
        </div>
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

        {errMsg && <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{errMsg}</div>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => nav("/tenants")}>Cancel</Button>
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
                Aguardando o container iniciar…
              </div>
            )}
            {hasError && (
              <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">
                Erro ao provisionar: {statusQuery.data?.last_error ?? "verifique os logs"}
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

            <div>
              <Label>Launcher fallback password</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                  {result.initial_password}
                </code>
                <Button type="button" variant="secondary" size="icon" onClick={copyPwd}>
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {result.owner_invite_token && (
              <div>
                <Label>Owner invite token</Label>
                <code className="block break-all rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100">
                  {result.owner_invite_token}
                </code>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={markDelivered} disabled={isProvisioning}>
                {isProvisioning
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Provisionando…</>
                  : "I've delivered this — open tenant"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
