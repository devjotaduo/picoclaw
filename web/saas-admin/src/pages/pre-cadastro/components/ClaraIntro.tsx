import { Bot, Lock, Mic, ShieldCheck } from "lucide-react";

export function ClaraIntro() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-6 lg:rounded-3xl lg:border lg:border-zinc-200 lg:bg-white/70 lg:p-7 lg:backdrop-blur lg:sticky lg:top-6 lg:self-start">
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
          <Bot className="h-6 w-6" />
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
          />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-900">Clara</div>
          <div className="text-xs text-zinc-500">consultora de pré-cadastro</div>
        </div>
      </div>

      <p className="text-sm leading-6 text-zinc-700">
        Vou conhecer sua empresa em 5 passos curtos para entender como nossos agentes podem ajudar — sem mudar nada
        automaticamente.
      </p>

      <ul className="space-y-3 text-xs text-zinc-600">
        <li className="flex items-start gap-2">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>Rascunho salvo automaticamente. Você pode retomar pelo link.</span>
        </li>
        <li className="flex items-start gap-2">
          <Mic aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>Áudio não é guardado, apenas a transcrição em texto.</span>
        </li>
        <li className="flex items-start gap-2">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <span>O relatório completo fica disponível só para revisão interna.</span>
        </li>
      </ul>
    </aside>
  );
}

export function MobileBrandStrip() {
  return (
    <div className="mb-3 flex items-center gap-2 px-1 lg:hidden">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
        <Bot className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-900">Pré-cadastro com a Clara</div>
        <div className="text-[11px] text-zinc-500">5 passos · rascunho salvo automaticamente</div>
      </div>
    </div>
  );
}
