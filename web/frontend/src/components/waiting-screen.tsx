import { Clock } from "lucide-react"

// Tela mostrada quando o tenant está em "waiting" — discovery concluído,
// aguardando admin/time fazer contato e liberar pra "tenant". Oculta
// chat, sidebar, header, tudo. Só essa mensagem central.
//
// Ativada quando ui-visibility.json tem active_profile="waiting" — Sofia
// (via Rafael) chama set_ui_profile("waiting") no fim do discovery
// (caminho A ou B). Admin promove pra "tenant" via painel admin depois
// que fizer contato e/ou resolver integrações.
export function WaitingScreen() {
  return (
    <div className="bg-background fixed inset-0 z-[200] flex items-center justify-center px-6 py-12">
      <div className="border-border bg-card text-card-foreground mx-auto flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl border p-10 text-center shadow-lg">
        <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-full">
          <Clock className="h-7 w-7" />
        </div>

        <div className="space-y-3">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Está tudo sendo preparado
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Nosso time recebeu seu cadastro e já está trabalhando nas últimas
            configurações pra equipe operar com segurança.
          </p>
          <p className="text-muted-foreground text-base leading-relaxed">
            Em breve você vai receber um contato nosso com os próximos passos.
          </p>
        </div>

        <div className="border-border/60 text-muted-foreground w-full border-t pt-5 text-xs">
          Você pode fechar esta janela. Vamos avisar pelo WhatsApp ou e-mail
          cadastrado quando o painel estiver liberado.
        </div>
      </div>
    </div>
  )
}
