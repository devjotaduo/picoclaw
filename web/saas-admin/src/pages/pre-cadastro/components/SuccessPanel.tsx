import { CheckCircle2, Sparkles } from "lucide-react";
import { statusLabel } from "../summary";
import type { CompanyIntake } from "@/api/company-intakes";

export function SuccessPanel({ intake }: { intake: CompanyIntake | null }) {
  return (
    <section
      aria-label="Pré-cadastro enviado"
      className="space-y-5 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
    >
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-emerald-100 motion-safe:animate-ping motion-safe:opacity-75"
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg">
          <CheckCircle2 className="h-10 w-10" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Pré-cadastro enviado!</h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-zinc-600">
          Obrigado! Recebemos suas respostas. Nossa equipe vai analisar o relatório completo e voltar com você em
          breve. Você já pode fechar esta página.
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-left text-xs text-zinc-600">
        {intake?.company_name && (
          <Row label="Empresa">{intake.company_name}</Row>
        )}
        {intake?.id && (
          <Row label="Código">
            <code className="font-mono text-[11px]">{intake.id}</code>
          </Row>
        )}
        {intake?.status && (
          <Row label="Status">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" />
              {statusLabel(intake.status)}
            </span>
          </Row>
        )}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
      <span className="text-zinc-800">{children}</span>
    </div>
  );
}
