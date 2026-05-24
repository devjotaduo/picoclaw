/**
 * Single-page landing for jotaduo.com (apex).
 *
 * Produção: servida pelo controlplane PicoClaw a partir de
 * /var/lib/picoclaw-landing/. O app admin e os tenants continuam separados.
 */

const ADMIN_URL = "https://adm.jotaduo.com"
const PRE_CADASTRO_URL = "/pre-cadastro"
const SUPPORT_EMAIL = "dev@jotaduo.com"

const networkRows = [
  {
    channel: "WhatsApp",
    agent: "Clara",
    state: "Atendendo",
    time: "agora",
    detail: "fila principal",
  },
  {
    channel: "Instagram",
    agent: "Marcos",
    state: "Qualificando",
    time: "2 min",
    detail: "lead comercial",
  },
  {
    channel: "Site",
    agent: "Sofia",
    state: "Coletando",
    time: "4 min",
    detail: "cadastro pendente",
  },
  {
    channel: "Humano",
    agent: "Rafael",
    state: "Alerta",
    time: "quando precisa",
    detail: "exceções e bloqueios",
  },
]

const platformCards = [
  {
    title: "Memória do negócio",
    body: "Produtos, regras, tom de voz e histórico ficam em arquivos claros para o agente consultar.",
  },
  {
    title: "Roteamento por agente",
    body: "Cada função tem dono: atendimento, vendas, onboarding, alerta e revisão humana.",
  },
  {
    title: "Canais conectados",
    body: "WhatsApp primeiro, outros canais depois, com a mesma operação e o mesmo histórico.",
  },
]

const capabilities = [
  "Atende dúvidas frequentes",
  "Qualifica oportunidades",
  "Agenda próximos passos",
  "Aciona humano no limite",
  "Registra histórico",
  "Aprende com correções",
]

const useCases = [
  {
    eyebrow: "Atendimento",
    title: "Fila respondida mesmo fora do horário",
    body: "O agente resolve o comum, organiza o contexto e deixa só os casos sensíveis para a equipe.",
  },
  {
    eyebrow: "Vendas",
    title: "Lead com próxima ação definida",
    body: "Perguntas, objeções e intenção de compra viram resumo prático para continuar o contato.",
  },
  {
    eyebrow: "Onboarding",
    title: "Cadastro guiado sem formulário frio",
    body: "Sofia coleta dados em conversa, valida pendências e prepara o painel para começar.",
  },
]

export function App() {
  return (
    <div className="min-h-screen bg-page text-ink-950">
      <Nav />
      <main>
        <Hero />
        <DeliverySection />
        <OverheadSection />
        <ProofSection />
        <UseCases />
        <CallToAction />
      </main>
      <Footer />
    </div>
  )
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-950/10 bg-page/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-2" aria-label="Jotaduo">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">Jotaduo</span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-ink-600 md:flex">
          <a className="nav-link" href="#rede">
            Rede
          </a>
          <a className="nav-link" href="#operacao">
            Operação
          </a>
          <a className="nav-link" href="#casos">
            Casos de uso
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <a className="button button-secondary hidden sm:inline-flex" href={ADMIN_URL}>
            Entrar
          </a>
          <a className="button button-primary" href={PRE_CADASTRO_URL}>
            Criar agente
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ink-950/10">
      <PerspectiveRoom />
      <div className="relative z-10 mx-auto grid min-h-[560px] max-w-7xl place-items-center px-4 py-12 sm:min-h-[640px] sm:px-6 sm:py-16 lg:min-h-[680px] lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <FloatingMark />
          <h1 className="mt-12 text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.045em] text-ink-950 sm:text-6xl lg:text-7xl">
            Uma rede de atendimento autônoma
          </h1>
          <p className="mx-auto mt-12 max-w-xl text-pretty text-lg leading-8 text-ink-600 sm:mt-24 sm:text-xl lg:mt-28">
            Configure uma vez. A Jotaduo conversa em todos os canais, mantém
            contexto, chama humanos no momento certo e deixa a operação visível
            em tempo real.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a className="button button-primary button-large" href={PRE_CADASTRO_URL}>
              Começar cadastro
            </a>
            <a className="button button-secondary button-large" href={ADMIN_URL}>
              Ver painel
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function NetworkConsole() {
  return (
    <aside
      className="relative z-10 mt-14 overflow-hidden rounded-[28px] border border-ink-950/10 bg-white shadow-[0_40px_100px_-60px_rgba(0,0,0,0.65)] lg:mt-0"
      aria-label="Prévia da rede de atendimento"
    >
      <div className="flex items-center justify-between border-b border-ink-950/10 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">
            Rede ativa
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-950">
            jotaduo.com/operação
          </p>
        </div>
        <span className="status-dot">ao vivo</span>
      </div>

      <div className="grid grid-cols-3 border-b border-ink-950/10">
        <Metric value="4" label="agentes" />
        <Metric value="12ms" label="triagem" />
        <Metric value="99.9%" label="pronto" />
      </div>

      <div className="divide-y divide-ink-950/10">
        {networkRows.map((row) => (
          <div className="grid grid-cols-[1fr_auto] gap-5 px-5 py-4" key={row.channel}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="truncate text-sm font-semibold text-ink-950">
                  {row.channel} · {row.agent}
                </p>
              </div>
              <p className="mt-1 truncate text-sm text-ink-500">{row.detail}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-ink-950">{row.state}</p>
              <p className="mt-1 text-xs text-ink-500">{row.time}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-ink-950 px-5 py-5 text-white">
        <p className="text-sm font-medium">Próxima ação sugerida</p>
        <p className="mt-2 text-sm leading-6 text-white/68">
          Sofia precisa finalizar o cadastro. Rafael será chamado se faltar uma
          regra obrigatória.
        </p>
      </div>
    </aside>
  )
}

function DeliverySection() {
  return (
    <section id="rede" className="border-b border-ink-950/10">
      <div className="mx-auto grid max-w-7xl gap-0 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <SectionHeader
          kicker="Configure uma vez"
          title="A mesma inteligência em todos os pontos de contato."
          body="A operação conversa por WhatsApp, site e canais futuros sem duplicar regras. O painel mostra o que está ativo, bloqueado ou precisando de humano."
        />

        <div className="grid border-t border-ink-950/10 lg:border-l lg:border-t-0">
          <div className="grid min-h-[500px] place-items-center border-b border-ink-950/10 p-6">
            <NetworkConsole />
          </div>
          <div className="grid sm:grid-cols-3">
            {platformCards.map((card) => (
              <article
                className="border-b border-ink-950/10 p-6 sm:border-b-0 sm:border-r last:sm:border-r-0"
                key={card.title}
              >
                <h3 className="text-sm font-semibold text-ink-950">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-600">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function OverheadSection() {
  return (
    <section id="operacao" className="border-b border-ink-950/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <SectionHeader
            kicker="Sem operação pesada"
            title="O painel vira o centro de controle do atendimento."
            body="A equipe não precisa entender arquivos, jobs ou integrações técnicas. Ela vê tarefas, pendências, memória e alertas na linguagem da operação."
          />

          <div className="grid border-t border-ink-950/10 lg:border-l lg:border-t-0">
            <div className="grid gap-px bg-ink-950/10 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <div className="bg-page p-6" key={item}>
                  <CheckIcon />
                  <p className="mt-4 text-base font-medium text-ink-950">{item}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-950/10 p-6 sm:p-8">
              <div className="rounded-2xl border border-ink-950/10 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">
                      Agente pronto para responder
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      Memória revisada · canais conectados · humano em alerta
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Pronto
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProofSection() {
  return (
    <section className="border-b border-ink-950/10">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-ink-500">
          Feito para equipes que precisam responder rápido, vender melhor e
          manter controle humano.
        </p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-ink-950/10 bg-ink-950/10 sm:grid-cols-4">
          <ProofMetric value="24h" label="atendimento ativo" />
          <ProofMetric value="1" label="memória por empresa" />
          <ProofMetric value="4" label="papéis de agente" />
          <ProofMetric value="0" label="formulário frio" />
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  return (
    <section id="casos" className="border-b border-ink-950/10">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Casos de uso</p>
            <h2 className="mt-5 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.035em] text-ink-950 sm:text-5xl">
              A mesma base para atendimento, vendas e onboarding.
            </h2>
          </div>
          <a className="button button-secondary w-fit" href={`mailto:${SUPPORT_EMAIL}`}>
            Falar com a equipe
          </a>
        </div>

        <div className="grid gap-px overflow-hidden rounded-[28px] border border-ink-950/10 bg-ink-950/10 lg:grid-cols-3">
          {useCases.map((item) => (
            <article className="bg-white p-7 sm:p-8" key={item.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
                {item.eyebrow}
              </p>
              <h3 className="mt-16 text-2xl font-semibold tracking-[-0.02em] text-ink-950">
                {item.title}
              </h3>
              <p className="mt-4 text-sm leading-6 text-ink-600">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CallToAction() {
  return (
    <section className="relative overflow-hidden">
      <GridLines />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <p className="eyebrow mx-auto">Comece pelo cadastro guiado</p>
        <h2 className="mt-6 text-balance text-5xl font-semibold leading-none tracking-[-0.04em] text-ink-950 sm:text-7xl">
          Crie o primeiro agente e veja a operação nascer.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-600">
          Em poucos minutos a Sofia entende seu negócio, identifica pendências e
          prepara o acesso do painel.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a className="button button-primary button-large" href={PRE_CADASTRO_URL}>
            Iniciar agora
          </a>
          <a className="button button-secondary button-large" href={ADMIN_URL}>
            Já tenho acesso
          </a>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-ink-950/10 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-sm font-semibold text-ink-950">Jotaduo</p>
            <p className="text-sm text-ink-500">
              Atendimento conversacional com IA
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
          <a className="nav-link" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          <a className="nav-link" href={ADMIN_URL}>
            Painel
          </a>
          <span>© {year} Jotaduo</span>
        </nav>
      </div>
    </footer>
  )
}

function SectionHeader({
  kicker,
  title,
  body,
}: {
  kicker: string
  title: string
  body: string
}) {
  return (
    <div className="flex min-h-[520px] flex-col justify-center py-16 lg:pr-14">
      <p className="eyebrow">{kicker}</p>
      <h2 className="mt-6 max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-6xl">
        {title}
      </h2>
      <p className="mt-6 max-w-xl text-lg leading-8 text-ink-600">{body}</p>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r border-ink-950/10 p-5 last:border-r-0">
      <p className="text-2xl font-semibold tracking-[-0.04em] text-ink-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-ink-500">
        {label}
      </p>
    </div>
  )
}

function ProofMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white p-6 text-center">
      <p className="text-4xl font-semibold tracking-[-0.04em] text-ink-950">
        {value}
      </p>
      <p className="mt-2 text-sm text-ink-500">{label}</p>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      className="h-6 w-6 text-emerald-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function GridLines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(10,10,10,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,10,10,0.06)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
      aria-hidden="true"
    />
  )
}

function PerspectiveRoom() {
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-center" aria-hidden="true">
      <div className="perspective-room" />
    </div>
  )
}

function FloatingMark() {
  return (
    <div className="mx-auto h-20 w-20 sm:h-24 sm:w-24" aria-hidden="true">
      <div className="floating-mark">
        <span />
      </div>
    </div>
  )
}

function LogoMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="7" fill="#0A0A0A" />
      <path d="M7 21V7h14v14H7Z" stroke="white" strokeWidth="2" />
      <path d="M7 21 21 7" stroke="white" strokeWidth="2" />
    </svg>
  )
}
