import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, RefreshCw, ShieldCheck, X, XCircle } from "lucide-react";
import { listTenants, type Tenant } from "@/api/tenants";
import {
  getDiscoveryStatus,
  liberateTenant,
  type DiscoveryCheck,
  type DiscoveryIntegracao,
  type DiscoveryStatus,
  type LiberateResult,
} from "@/api/tenants-discovery";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// TenantsDiscovery — admin tab listing every tenant with a per-tenant
// "Ver pendências" drawer that fetches discovery-status. When all green
// the operator can click LIBERAR TENANT to flip ui-visibility.json's
// active_profile from "public" to "tenant".
//
// Tenants are listed unfiltered for V1 (we don't yet have a `discovery`
// status column on the row, and the in-flight active_profile only lives
// in the per-tenant file). Filtering by client-side active_profile would
// require an N+1 fetch, so we let the operator browse all tenants and the
// drawer surfaces the real state on demand.
export function TenantsDiscovery() {
  const q = useQuery({ queryKey: ["tenants"], queryFn: listTenants, refetchInterval: 30_000 });
  const tenants = q.data?.tenants ?? [];
  const [selected, setSelected] = useState<Tenant | null>(null);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenants em Discovery</h1>
          <p className="text-xs text-zinc-500">
            Confira o checklist de validação por tenant e libere o painel completo quando estiver pronto.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={q.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Atualizar
        </Button>
      </header>

      {q.isError && (
        <div className="rounded bg-red-950/50 p-3 text-xs text-red-300">Falha ao carregar tenants.</div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Subdomain</th>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {q.isLoading && (
              <>
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
                <SkeletonRow cols={5} />
              </>
            )}
            {!q.isLoading && tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-zinc-500">
                  Nenhum tenant provisionado ainda.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2">
                  <span className="font-medium text-brand-500">{t.subdomain}</span>
                  <div className="text-[10px] text-zinc-600">{t.id}</div>
                </td>
                <td className="px-3 py-2 text-zinc-300">{t.display_name || "—"}</td>
                <td className="px-3 py-2 text-zinc-400">{t.owner_email}</td>
                <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(t)}
                    aria-label={`Ver pendências de ${t.subdomain}`}
                  >
                    Ver pendências <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <DiscoveryPanel tenant={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DiscoveryPanel({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [markPending, setMarkPending] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ["tenant-discovery", tenant.id],
    queryFn: () => getDiscoveryStatus(tenant.id),
  });

  const markResolvedM = useMutation({
    mutationFn: (key: string) => getDiscoveryStatus(tenant.id, { markResolved: [key] }),
    onMutate: (key) => {
      setMarkPending(key);
    },
    onSuccess: (data) => {
      qc.setQueryData(["tenant-discovery", tenant.id], data);
      toast({ type: "success", message: "Integração marcada como resolvida." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao marcar integração." }),
    onSettled: () => setMarkPending(null),
  });

  const liberateM = useMutation({
    mutationFn: () => liberateTenant(tenant.id),
    onSuccess: (data: LiberateResult) => {
      if (data.liberated) {
        toast({ type: "success", message: `Tenant ${tenant.subdomain} liberado.` });
        qc.invalidateQueries({ queryKey: ["tenant-discovery", tenant.id] });
      } else {
        // 200 body shouldn't reach here when liberated=false (backend returns
        // 422), but defensively render the missing items anyway.
        toast({ type: "error", message: "Liberação rejeitada. Confira o checklist." });
      }
    },
    onError: (e: { error?: string; body?: Record<string, unknown> }) => {
      const missing = Array.isArray(e?.body?.missing_summary) ? (e.body!.missing_summary as string[]) : [];
      toast({
        type: "error",
        message:
          missing.length > 0
            ? `Liberação rejeitada: ${missing.join("; ")}`
            : e?.error ?? "Falha ao liberar tenant.",
      });
      // Refresh so the latest checklist replaces what we showed.
      qc.invalidateQueries({ queryKey: ["tenant-discovery", tenant.id] });
    },
  });

  const status = statusQ.data;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-zinc-100">{tenant.subdomain}</div>
            <div className="text-[10px] text-zinc-500">{tenant.id}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          {statusQ.isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando checklist…
            </div>
          )}
          {statusQ.isError && (
            <div className="rounded bg-red-950/50 p-3 text-xs text-red-300">Falha ao carregar checklist.</div>
          )}
          {status && (
            <div className="space-y-5">
              <ProfileBanner status={status} />

              {!status.script_used && (
                <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <code className="font-mono">validate_workspace.py</code> ainda não está instalado no workspace.
                      O botão de liberação fica desativado até o script aparecer em
                      <code className="ml-1 font-mono">workspace/skills/validate-workspace/</code>.
                    </span>
                  </div>
                </div>
              )}

              <Section title="Universal">
                {status.universal.length === 0 ? (
                  <div className="text-xs text-zinc-500">Sem itens universais reportados.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {status.universal.map((c) => (
                      <CheckRow key={c.key} check={c} />
                    ))}
                  </ul>
                )}
              </Section>

              {status.segmento_key && (
                <Section title={`Segmento — ${status.segmento_key}`}>
                  {(status.segmento_checks ?? []).length === 0 ? (
                    <div className="text-xs text-zinc-500">Sem itens específicos de segmento.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {(status.segmento_checks ?? []).map((c) => (
                        <CheckRow key={c.key} check={c} />
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              <Section title="Integrações">
                {status.integracoes_required.length === 0 ? (
                  <div className="text-xs text-zinc-500">Sem integrações obrigatórias.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {status.integracoes_required.map((it) => (
                      <IntegracaoRow
                        key={it.key}
                        item={it}
                        busy={markPending === it.key}
                        onMarkResolved={() => markResolvedM.mutate(it.key)}
                      />
                    ))}
                  </ul>
                )}
              </Section>

              {status.missing_summary.length > 0 && (
                <Section title="Pendências">
                  <ul className="list-disc space-y-1 pl-5 text-xs text-amber-200">
                    {status.missing_summary.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 px-4 py-3">
          <Button
            className="w-full"
            disabled={!status?.ok || !status?.script_used || liberateM.isPending || status?.active_profile === "tenant"}
            onClick={() => liberateM.mutate()}
          >
            <ShieldCheck className="h-4 w-4" />
            {status?.active_profile === "tenant"
              ? "TENANT JÁ LIBERADO"
              : liberateM.isPending
                ? "Liberando…"
                : "LIBERAR TENANT"}
          </Button>
          {!status?.ok && status?.script_used && (
            <p className="mt-2 text-center text-[10px] text-zinc-500">
              Resolva os itens em vermelho para habilitar a liberação.
            </p>
          )}
        </footer>
      </aside>
    </div>
  );
}

function ProfileBanner({ status }: { status: DiscoveryStatus }) {
  const active = status.active_profile === "tenant";
  return (
    <div
      className={cn(
        "rounded border px-3 py-2 text-xs",
        active
          ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200"
          : "border-zinc-700 bg-zinc-900/60 text-zinc-300",
      )}
    >
      <span className="font-semibold uppercase tracking-wider">Perfil atual:</span>{" "}
      <span className="font-mono">{status.active_profile}</span>
      {active && (
        <span className="ml-2 text-emerald-300">— painel completo já visível ao tenant.</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}

function CheckRow({ check }: { check: DiscoveryCheck }) {
  return (
    <li className="flex items-start gap-2 rounded border border-zinc-800/60 px-2 py-1.5">
      {check.present ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <div className="flex-1 text-xs">
        <div className={check.present ? "text-zinc-200" : "text-zinc-300"}>{check.label}</div>
        {check.note && <div className="mt-0.5 text-[10px] text-zinc-500">{check.note}</div>}
      </div>
    </li>
  );
}

function IntegracaoRow({
  item,
  busy,
  onMarkResolved,
}: {
  item: DiscoveryIntegracao;
  busy: boolean;
  onMarkResolved: () => void;
}) {
  const resolved = item.status === "resolved";
  const skipped = item.status === "skipped";
  return (
    <li className="flex items-start gap-2 rounded border border-zinc-800/60 px-2 py-1.5">
      {resolved ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : skipped ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <div className="flex-1 text-xs">
        <div className="text-zinc-200">{item.label}</div>
        <div className="mt-0.5 text-[10px] text-zinc-500">
          Status: <span className="font-mono">{item.status}</span>
          {item.note && <span> — {item.note}</span>}
        </div>
      </div>
      {!resolved && (
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkResolved}
          disabled={busy}
          className="shrink-0"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Marcar resolvida"}
        </Button>
      )}
    </li>
  );
}
