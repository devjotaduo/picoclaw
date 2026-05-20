import {
  IconArrowUp,
  IconClipboardText,
  IconMessageCircle,
  IconMicrophone,
  IconPaperclip,
  IconUsers,
} from "@tabler/icons-react"
import * as React from "react"

import { AIOrbAvatar } from "@/components/chat/ai-orb-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const quickActions = [
  { label: "Organizar meu atendimento", icon: IconMessageCircle },
  { label: "Criar primeiro resumo", icon: IconClipboardText },
  { label: "Configurar minha equipe", icon: IconUsers },
]

const introMessages = [
  {
    from: "sofia",
    text: "Vamos começar. Me diga qual canal ou etapa você quer configurar primeiro.",
  },
]

type ChatMessage = {
  from: "sofia" | "user"
  text: string
}

function buildSofiaReply(value: string): string {
  const normalized = value.toLowerCase()

  if (normalized.includes("equipe") || normalized.includes("time")) {
    return "Vou mapear quem atende, quem aprova e quando devo pedir uma decisão."
  }

  if (normalized.includes("resumo") || normalized.includes("relatório")) {
    return "Posso preparar um resumo curto com próximos passos e pendências do onboarding."
  }

  if (normalized.includes("atendimento") || normalized.includes("whatsapp")) {
    return "Vou priorizar o WhatsApp, separar conversas novas e sugerir o primeiro fluxo."
  }

  return "Anotado. Vou transformar isso em um próximo passo simples para começar agora."
}

function SofiaOrb() {
  return (
    <div
      className="ring-border/40 size-11 overflow-hidden rounded-full shadow-sm ring-1"
      aria-hidden="true"
    >
      <AIOrbAvatar />
    </div>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="Sofia digitando">
      <span className="sofia-dot bg-muted-foreground/60 size-1.5 rounded-full" />
      <span className="sofia-dot bg-muted-foreground/60 size-1.5 rounded-full [animation-delay:140ms]" />
      <span className="sofia-dot bg-muted-foreground/60 size-1.5 rounded-full [animation-delay:280ms]" />
    </span>
  )
}

function MessageBubble({
  message,
  index,
}: {
  message: ChatMessage
  index: number
}) {
  const isSofia = message.from === "sofia"

  return (
    <div
      className={cn(
        "sofia-message-reveal flex w-full gap-3",
        isSofia ? "justify-start" : "justify-end",
      )}
      style={{ animationDelay: `${160 + index * 150}ms` }}
    >
      <div
        className={cn(
          "max-w-[min(82%,680px)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:text-base",
          isSofia
            ? "bg-card text-card-foreground ring-border/60 rounded-bl-md ring-1"
            : "bg-primary text-primary-foreground rounded-br-md",
        )}
      >
        {message.text}
      </div>
    </div>
  )
}

export function SofiaOnboardingChatPage() {
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])

  const addUserMessage = React.useCallback((value: string) => {
    const text = value.trim()

    if (!text) return

    setMessages((current) => [
      ...current,
      { from: "user", text },
      { from: "sofia", text: buildSofiaReply(text) },
    ])
  }, [])

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      addUserMessage(input)
      setInput("")
    },
    [addUserMessage, input],
  )

  const visibleMessages = [...introMessages, ...messages] as ChatMessage[]

  return (
    <main className="text-foreground bg-background flex min-h-svh flex-col">
      <style>{`
        @keyframes sofia-message-reveal {
          from {
            opacity: 0;
            transform: translateY(14px) scale(.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes sofia-dot {
          0%, 80%, 100% {
            opacity: .35;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-3px);
          }
        }

        .sofia-message-reveal {
          opacity: 0;
          animation: sofia-message-reveal .68s cubic-bezier(.2, .82, .2, 1) forwards;
        }

        .sofia-dot {
          animation: sofia-dot 1.2s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .sofia-message-reveal,
          .sofia-dot {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <header className="border-border/70 bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:h-18 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden sm:block">
              <SofiaOrb />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-medium sm:text-lg">
                Sofia
              </h1>
            </div>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Online
          </Badge>
        </div>
      </header>

      <section
        className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 sm:px-6"
        aria-label="Chat público com Sofia"
      >
        <div
          className="flex flex-1 flex-col gap-3 py-5 sm:gap-4 sm:py-8"
          aria-live="polite"
        >
          <div className="mx-auto mb-3 flex max-w-md flex-col items-center gap-3 text-center sm:gap-1">
            <div className="block sm:hidden">
              <SofiaOrb />
            </div>
            <h2 className="text-xl font-medium sm:text-2xl">
              Converse com a Sofia
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              Ela faz perguntas curtas e monta o onboarding com você.
            </p>
          </div>

          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {visibleMessages.map((message, index) => (
              <MessageBubble
                key={`${message.from}-${message.text}-${index}`}
                message={message}
                index={index}
              />
            ))}
            <div className="sofia-message-reveal flex justify-start">
              <div className="bg-card text-card-foreground ring-border/60 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-sm ring-1">
                <TypingDots />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-auto flex w-full max-w-3xl flex-wrap gap-2 pt-4">
            {quickActions.map((action) => {
              const ActionIcon = action.icon

              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-background/80 rounded-full"
                  onClick={() => addUserMessage(action.label)}
                >
                  <ActionIcon data-icon="inline-start" />
                  {action.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="bg-background/95 border-border/70 sticky bottom-0 border-t py-3 backdrop-blur sm:py-4">
          <form
            className="bg-card border-border/80 shadow-foreground/5 mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border p-2 shadow-lg"
            onSubmit={handleSubmit}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Anexar documento"
            >
              <IconPaperclip data-icon="inline-start" />
            </Button>
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escreva para a Sofia..."
              aria-label="Mensagem para Sofia"
              className="h-10 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Enviar áudio"
            >
              <IconMicrophone data-icon="inline-start" />
            </Button>
            <Button type="submit" size="icon-sm" aria-label="Enviar">
              <IconArrowUp data-icon="inline-start" />
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
