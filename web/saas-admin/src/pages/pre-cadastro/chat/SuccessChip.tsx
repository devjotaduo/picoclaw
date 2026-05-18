import { CheckCircle2 } from "lucide-react";

type Props = {
  companyName: string;
  intakeId: string;
};

export function SuccessChip({ companyName, intakeId }: Props) {
  return (
    <div
      className="pc-pop-in mx-1 mt-2 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4"
      role="status"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="pc-pulse-ring absolute inset-0 rounded-full bg-emerald-200/60"
          />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow">
            <CheckCircle2 className="h-6 w-6" />
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-emerald-950">Pré-cadastro enviado!</div>
          <div className="truncate text-xs text-emerald-800">
            {companyName ? `Empresa: ${companyName} · ` : ""}
            Código <code className="font-mono">{intakeId.slice(0, 8)}</code>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-emerald-900">
        Recebemos suas respostas. A equipe vai analisar o relatório completo e voltar com você em breve. Você já pode
        fechar esta página.
      </p>
    </div>
  );
}
