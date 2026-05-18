import { Sparkles } from "lucide-react";
import { ReportPreview } from "../components/ReportPreview";
import type { SummaryPreview } from "../types";

type StepReviewProps = {
  hasSummary: boolean;
  previewSummary: SummaryPreview;
};

export function StepReview({ hasSummary, previewSummary }: StepReviewProps) {
  if (hasSummary) {
    return <ReportPreview summary={previewSummary} />;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Sparkles aria-hidden className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Pronto para gerar o resumo</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-700">
            Vou montar um resumo com os pontos que entendi. Você revisa antes de confirmar o envio — nenhum agente é
            alterado até esse momento.
          </p>
        </div>
      </div>
      <ul className="ml-1 space-y-1.5 text-sm text-zinc-700">
        <PreviewBullet>Resumo curto sobre a empresa e a oferta.</PreviewBullet>
        <PreviewBullet>Pontos entendidos a partir das suas respostas.</PreviewBullet>
        <PreviewBullet>Próximos passos da nossa equipe interna.</PreviewBullet>
      </ul>
      <p className="text-xs text-zinc-500">
        Toque em <strong>Gerar resumo</strong> abaixo. Você ainda pode voltar e complementar antes de enviar.
      </p>
    </div>
  );
}

function PreviewBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
      <span>{children}</span>
    </li>
  );
}
