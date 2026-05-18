import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import {
  attachmentDownloadUrl,
  getCompanyIntake,
  linkCompanyIntakeTenant,
  listCompanyIntakes,
  updateCompanyIntakeStatus,
  type CompanyIntake,
  type CompanyIntakeStatus,
} from "@/api/company-intakes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/utils";

const statuses = ["all", "draft", "report_ready", "submitted", "reviewed", "linked"];

export function CompanyIntakes() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("");
  const q = useQuery({ queryKey: ["company-intakes", status], queryFn: () => listCompanyIntakes(status), refetchInterval: 20_000 });
  const selected = useQuery({
    queryKey: ["company-intake", selectedId],
    queryFn: () => getCompanyIntake(selectedId!),
    enabled: !!selectedId,
  });
  const items = q.data?.intakes ?? [];
  const current = selected.data;

  const statusM = useMutation({
    mutationFn: ({ id, next }: { id: string; next: CompanyIntakeStatus }) => updateCompanyIntakeStatus(id, next),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["company-intakes"] });
      qc.setQueryData(["company-intake", data.id], data);
    },
  });
  const linkM = useMutation({
    mutationFn: ({ id, tenant }: { id: string; tenant: string }) => linkCompanyIntakeTenant(id, tenant),
    onSuccess: async (data) => {
      setTenantId("");
      await qc.invalidateQueries({ queryKey: ["company-intakes"] });
      qc.setQueryData(["company-intake", data.id], data);
    },
  });

  return (
    <div className="grid h-full grid-cols-[minmax(360px,440px)_1fr] overflow-hidden">
      <section className="border-r border-zinc-800 p-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Pré-cadastros</h1>
            <p className="text-xs text-zinc-500">Intakes públicos conduzidos pela Clara</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </header>
        <select
          className="mb-4 h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="space-y-2 overflow-y-auto pr-1">
          {q.isLoading && <div className="text-sm text-zinc-500">Loading…</div>}
          {items.map((item) => (
            <button
              key={item.id}
              className={selectedId === item.id ? "w-full rounded-lg border border-brand-700 bg-zinc-900 p-3 text-left" : "w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left hover:bg-zinc-900"}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-100">{item.company_name || "Empresa sem nome"}</div>
                  <div className="text-xs text-zinc-500">{item.contact_name || "Responsável pendente"} · {relativeTime(item.created_at)}</div>
                </div>
                <span className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">{item.status}</span>
              </div>
            </button>
          ))}
          {!q.isLoading && items.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Nenhum intake encontrado.</div>}
        </div>
      </section>

      <section className="overflow-y-auto p-6">
        {!current && <div className="flex h-full items-center justify-center text-sm text-zinc-500">Selecione um pré-cadastro.</div>}
        {current && (
          <div className="mx-auto max-w-4xl space-y-5">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{current.company_name || "Empresa sem nome"}</h2>
                <p className="text-sm text-zinc-500">{current.contact_name} · {current.contact_whatsapp || current.contact_email}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={statusM.isPending} onClick={() => statusM.mutate({ id: current.id, next: "reviewed" })}>Marcar revisado</Button>
              </div>
            </header>

            <InfoGrid intake={current} />

            <Panel title="Resumo público">
              <JSONBlock value={current.public_summary} />
            </Panel>

            <Panel title="Relatório completo">
              <JSONBlock value={current.report} />
            </Panel>

            <Panel title="Respostas estruturadas">
              <JSONBlock value={current.answers} />
            </Panel>

            <Panel title="Anexos">
              {current.attachments?.length ? (
                <div className="space-y-2">
                  {current.attachments.map((a) => (
                    <a key={a.id} className="flex items-center gap-2 text-sm text-brand-500 hover:underline" href={attachmentDownloadUrl(current.id, a.id)}>
                      <FileText className="h-4 w-4" /> {a.kind}: {a.name} <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              ) : <div className="text-sm text-zinc-500">Sem anexos.</div>}
            </Panel>

            <Panel title="Vincular a tenant">
              <div className="flex gap-2">
                <Input placeholder="tenant_id" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                <Button disabled={linkM.isPending || !tenantId.trim()} onClick={() => linkM.mutate({ id: current.id, tenant: tenantId.trim() })}>Vincular</Button>
              </div>
              {current.linked_tenant_id && <p className="mt-2 text-xs text-emerald-400">Vinculado a {current.linked_tenant_id}</p>}
            </Panel>
          </div>
        )}
      </section>
    </div>
  );
}

function InfoGrid({ intake }: { intake: CompanyIntake }) {
  const rows = useMemo(() => [
    ["Status", intake.status],
    ["Código", intake.id],
    ["Criado", relativeTime(intake.created_at)],
    ["Enviado", intake.submitted_at ? relativeTime(intake.submitted_at) : "—"],
    ["WhatsApp", intake.contact_whatsapp || "—"],
    ["E-mail", intake.contact_email || "—"],
  ], [intake]);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-[10px] uppercase text-zinc-600">{label}</div>
          <div className="mt-1 break-words text-sm text-zinc-200">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function JSONBlock({ value }: { value: unknown }) {
  if (!value || (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0)) {
    return <div className="text-sm text-zinc-500">Sem dados.</div>;
  }
  return <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-3 text-xs text-zinc-300">{JSON.stringify(value, null, 2)}</pre>;
}
