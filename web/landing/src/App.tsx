/**
 * Single-page landing for jotaduo.com (apex).
 *
 * Servido em produção pelo controlplane Picoclaw que detecta o Host
 * `jotaduo.com` e devolve estes estáticos a partir de
 * /var/lib/picoclaw-landing/. `admin.jotaduo.com` e subdomínios de
 * tenant continuam servindo o SPA admin via embed — esta landing
 * NÃO é embedada no binário Go.
 *
 * Iteração: edite estes arquivos, rode `pnpm build` em web/landing/,
 * scp do dist/ pra VPS. Sem rebuild do controlplane.
 */

const ADMIN_URL = "https://adm.jotaduo.com"
const SUPPORT_EMAIL = "dev@jotaduo.com"

export function App() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Features />
        <Steps />
        <CallToAction />
      </main>
      <Footer />
    </div>
  )
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-3" aria-label="Jotaduo">
          <Logo />
          <div className="leading-tight">
            <div className="text-base font-bold text-brand-600">Jotaduo</div>
            <div className="text-[11px] font-medium tracking-wide text-ink-400">
              Atendimento com IA
            </div>
          </div>
        </a>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <a
            href="#features"
            className="hidden rounded-md px-3 py-2 text-ink-500 transition-colors hover:text-ink-900 md:inline-block"
          >
            Recursos
          </a>
          <a
            href="#como-funciona"
            className="hidden rounded-md px-3 py-2 text-ink-500 transition-colors hover:text-ink-900 md:inline-block"
          >
            Como funciona
          </a>
          <a
            href={ADMIN_URL}
            className="ml-2 rounded-lg border border-brand-500/20 bg-white px-4 py-2 text-sm font-semibold text-brand-600 shadow-sm transition-all hover:border-brand-500/40 hover:bg-brand-50"
          >
            Entrar
          </a>
        </nav>
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="drop-shadow-sm"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#0e5a2b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logoGrad)" />
      <text
        x="32"
        y="44"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fontSize="36"
        fontWeight="700"
        fill="#ffffff"
        textAnchor="middle"
      >
        J
      </text>
    </svg>
  )
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-20 md:pt-32 md:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <div className="fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-50 px-4 py-1.5 text-xs font-medium text-brand-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Atendimento ativo 24 horas
        </div>

        <h1 className="fade-up fade-up-delay-1 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl">
          Atendimento{" "}
          <span className="bg-gradient-to-br from-brand-500 to-brand-700 bg-clip-text text-transparent">
            conversacional
          </span>{" "}
          com IA
        </h1>

        <p className="fade-up fade-up-delay-2 mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-500 sm:text-xl">
          WhatsApp, Telegram e outros canais — com agentes que aprendem o seu
          negócio, qualificam leads e fecham vendas enquanto sua equipe dorme.
        </p>

        <div className="fade-up fade-up-delay-3 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Quero%20conhecer%20o%20Jotaduo`}
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_-8px_rgba(21,128,61,0.5)] transition-all hover:shadow-[0_12px_28px_-8px_rgba(21,128,61,0.6)] hover:brightness-110 active:translate-y-px"
          >
            Falar com a equipe
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-hover:translate-x-1"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <a
            href={ADMIN_URL}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-7 py-3.5 text-base font-semibold text-ink-700 shadow-sm transition-all hover:border-black/20 hover:bg-ink-50/50"
          >
            Já tenho conta
          </a>
        </div>

        <p className="mt-6 text-xs text-ink-400">
          Sem cartão · Onboarding guiado · Setup em minutos
        </p>
      </div>

      {/* Visual element — chat bubble preview */}
      <div className="fade-up fade-up-delay-3 mt-16 sm:mt-20">
        <ChatPreview />
      </div>
    </section>
  )
}

function ChatPreview() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_30px_80px_-20px_rgba(21,128,61,0.15)] ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b border-black/5 bg-ink-50/40 px-5 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
          </div>
          <div className="ml-3 text-xs font-medium text-ink-400">
            wa.me/jotaduo · agente Ana
          </div>
        </div>
        <div className="space-y-3 px-5 py-6">
          <Bubble side="left">
            Oi! Vi sua agenda online — vocês fazem instalação no fim de semana?
          </Bubble>
          <Bubble side="right">
            Olá! Fazemos sim — sábado das 8h às 18h. Vou te mostrar os horários
            disponíveis pra esta semana 👇
          </Bubble>
          <Bubble side="right" muted>
            Sábado · 09:00 · 11:00 · 14:00 · 16:00
          </Bubble>
          <Bubble side="left">11:00 fica perfeito!</Bubble>
          <Bubble side="right">
            Agendado ✓ Vou te mandar a confirmação por aqui e por e-mail.
            Qualquer coisa é só chamar.
          </Bubble>
        </div>
      </div>
    </div>
  )
}

function Bubble({
  side,
  muted,
  children,
}: {
  side: "left" | "right"
  muted?: boolean
  children: React.ReactNode
}) {
  const isRight = side === "right"
  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isRight
            ? muted
              ? "bg-brand-50 text-brand-700"
              : "bg-gradient-to-br from-brand-500 to-brand-600 text-white"
            : "bg-ink-50 text-ink-700"
        }`}
        style={isRight ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }}
      >
        {children}
      </div>
    </div>
  )
}

function Features() {
  const items = [
    {
      icon: (
        <path d="M12 8v4l3 3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" />
      ),
      title: "Atende 24/7 sem parar",
      body: "O agente nunca dorme. Responde dúvidas, agenda atendimentos e qualifica leads enquanto sua equipe está fora.",
    },
    {
      icon: (
        <>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
        </>
      ),
      title: "Multi-canal nativo",
      body: "WhatsApp, Telegram, Matrix, IRC e mais. Um agente, várias caixas de entrada — sem perder histórico de conversa.",
    },
    {
      icon: (
        <>
          <path d="M9 11V7a3 3 0 0 1 6 0v4" />
          <rect x="5" y="11" width="14" height="10" rx="2" />
        </>
      ),
      title: "Aprende o seu negócio",
      body: "Você define o tom, os produtos, as regras e os horários. O agente segue o roteiro e aciona um humano quando precisa.",
    },
    {
      icon: (
        <>
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </>
      ),
      title: "Painel completo",
      body: "Veja conversas em tempo real, atribua atendimentos a humanos, edite skills e ajuste comportamento sem código.",
    },
    {
      icon: (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 10v6m11-11h-6M7 12H1m16.95-7.95-4.24 4.24M9.29 14.71l-4.24 4.24m0-13.9 4.24 4.24m5.42 5.42 4.24 4.24" />
        </>
      ),
      title: "Sub-agentes técnicos",
      body: "Pixel gera imagens, Doc gera contratos, Dev escreve código. Tudo dentro do mesmo workspace, sob seu controle.",
    },
    {
      icon: (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </>
      ),
      title: "Tenant isolado",
      body: "Seus dados ficam no seu próprio container. Memórias, sessões e credenciais — nada compartilhado entre clientes.",
    },
  ]

  return (
    <section
      id="features"
      className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-600">
          Por que Jotaduo
        </p>
        <h2 className="text-balance text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Tudo que o atendimento moderno precisa em um agente
        </h2>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.title}
            className="group relative rounded-2xl border border-black/5 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-500/20 hover:shadow-[0_20px_40px_-20px_rgba(21,128,61,0.25)]"
          >
            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-500/10">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.icon}
              </svg>
            </div>
            <h3 className="mb-2 text-base font-semibold text-ink-900">
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed text-ink-500">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Steps() {
  const steps = [
    {
      n: "01",
      title: "Configura o agente",
      body: "Você descreve seu negócio, seus produtos e o tom de voz. A IA já vem pronta para conversar — só precisa de contexto.",
    },
    {
      n: "02",
      title: "Conecta seus canais",
      body: "Plugue WhatsApp, Telegram ou outros canais via QR code ou token. Tudo num painel, sem mexer em código.",
    },
    {
      n: "03",
      title: "Atende automaticamente",
      body: "O agente conversa, agenda e qualifica leads. Você acompanha em tempo real e assume quando quiser.",
    },
  ]
  return (
    <section
      id="como-funciona"
      className="relative border-y border-black/5 bg-white/40 px-6 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-600">
            Como funciona
          </p>
          <h2 className="text-balance text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Sai do papel em minutos
          </h2>
        </header>

        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          {/* Connecting line on desktop */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-7 hidden h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-500/30 to-transparent md:block"
          />
          {steps.map((step) => (
            <li
              key={step.n}
              className="relative flex flex-col items-center text-center md:items-start md:text-left"
            >
              <div className="z-10 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand-500/15 bg-white text-base font-bold text-brand-600 shadow-sm">
                {step.n}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-ink-900">
                {step.title}
              </h3>
              <p className="max-w-sm text-sm leading-relaxed text-ink-500">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CallToAction() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 px-8 py-16 text-center shadow-[0_30px_80px_-20px_rgba(21,128,61,0.35)] sm:px-16">
        {/* Decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-1/4 -top-1/4 h-[140%] w-[60%] rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1/2 -left-1/4 h-[140%] w-[50%] rounded-full bg-brand-300/20 blur-3xl"
        />

        <div className="relative">
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            Pronto pra deixar seu atendimento no automático?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-brand-50/90 sm:text-lg">
            Fale com a equipe Jotaduo e veja como configurar o agente do seu
            negócio em uma conversa de 20 minutos.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Quero%20conhecer%20o%20Jotaduo`}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand-700 shadow-lg transition-all hover:shadow-xl active:translate-y-px"
          >
            Falar com a equipe
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-black/5 bg-white/60 px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-bold text-brand-600">Jotaduo</div>
            <div className="text-xs text-ink-400">
              Atendimento conversacional com IA
            </div>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-500">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="transition-colors hover:text-ink-900"
          >
            {SUPPORT_EMAIL}
          </a>
          <a
            href={ADMIN_URL}
            className="transition-colors hover:text-ink-900"
          >
            Painel
          </a>
          <span className="text-ink-300">© {year} Jotaduo</span>
        </nav>
      </div>
    </footer>
  )
}
