import { Sparkles } from "lucide-react";
import type { SummaryPreview } from "../types";

export function ReportPreview({ summary }: { summary: SummaryPreview }) {
  return (
    <article
      aria-label="Resumo gerado"
      className="pc-pop-in space-y-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5"
    >
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Sparkles aria-hidden className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-emerald-950">{summary.title}</h3>
          <p className="mt-1 text-sm leading-6 text-emerald-900">{summary.headline}</p>
        </div>
      </header>
      <SummaryList title="Pontos entendidos" items={summary.highlights} />
      <SummaryList title="Próximos passos" items={summary.next_steps} />
    </article>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
        {title}
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5 text-sm leading-6 text-emerald-950">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <span aria-hidden className="text-emerald-500">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-900">Sem itens suficientes ainda. Volte e complemente as respostas.</p>
      )}
    </section>
  );
}
