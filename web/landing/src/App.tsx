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
    channel: "Atendimento",
    function: "dúvidas e triagem",
    state: "Respondendo",
    time: "agora",
  },
  {
    channel: "Vendas",
    function: "leads e propostas",
    state: "Qualificando",
    time: "2 min",
  },
  {
    channel: "Marketing",
    function: "campanhas e conteúdo",
    state: "Criando",
    time: "4 min",
  },
  {
    channel: "Operação",
    function: "relatórios e alertas",
    state: "Monitorando",
    time: "ao vivo",
  },
]

const platformCards = [
  {
    title: "Contexto da empresa",
    body: "Produtos, regras, preços, canais e tom de voz ficam em uma base única.",
  },
  {
    title: "Rotina executada",
    body: "Atendimento, venda, suporte e operação recebem ações claras para seguir.",
  },
  {
    title: "Aprovação no ponto certo",
    body: "O comum segue sozinho; decisões sensíveis param para revisão humana.",
  },
]

const outcomes = [
  {
    label: "Menos fila",
    body: "Perguntas, triagem e encaminhamentos deixam de depender de alguém disponível.",
  },
  {
    label: "Menos retrabalho",
    body: "A mesma memória alimenta atendimento, venda, suporte, marketing e operação.",
  },
  {
    label: "Mais controle",
    body: "O histórico mostra o que foi feito, o que ficou pendente e onde precisa de dono.",
  },
]

const startSteps = [
  {
    title: "Conte como a empresa trabalha",
    body: "Produtos, canais, preços, regras e tom de voz entram no cadastro guiado.",
  },
  {
    title: "A rede encontra pendências",
    body: "O sistema aponta o que falta antes de deixar os agentes executarem.",
  },
  {
    title: "Você aprova e começa",
    body: "A rotina repetitiva roda com histórico, pausa e transferência humana quando precisa.",
  },
]

const capabilities = [
  "Responde clientes",
  "Qualifica vendas",
  "Resolve suporte",
  "Pesquisa preços",
  "Cria campanhas",
  "Gera relatórios",
  "Atualiza memória",
  "Testa fluxos",
  "Protege dados sensíveis",
]

const useCases = [
  {
    eyebrow: "Atendimento",
    title: "Clientes recebem resposta sem fila parada",
    body: "Dúvidas, triagem, grupos, reclamações simples e encaminhamento humano ficam organizados.",
  },
  {
    eyebrow: "Crescimento",
    title: "Vendas e marketing trabalham juntos",
    body: "Leads, propostas, follow-up, campanhas, posts e páginas simples saem do mesmo contexto.",
  },
  {
    eyebrow: "Operação",
    title: "A rotina interna vira fluxo automático",
    body: "Relatórios, compras, memória, testes, alertas e políticas reduzem trabalho repetitivo.",
  },
]

export function App() {
  return (
    <div className="min-h-screen bg-page text-ink-950">
      <Nav />
      <main>
        <Hero />
        <OutcomeStrip />
        <StartSection />
        <FlowCardsSection />
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
        <a href="/" className="flex items-center" aria-label="Jota Duo">
          <LogoMark />
        </a>

        <nav className="hidden items-center gap-6 text-sm text-ink-600 md:flex">
          <a className="nav-link" href="#comeca">
            Como começa
          </a>
          <a className="nav-link" href="#fluxos">
            Fluxos
          </a>
          <a className="nav-link" href="#operacao">
            Funções
          </a>
          <a className="nav-link" href="#casos">
            Casos de uso
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex">
            <a className="button button-secondary" href={ADMIN_URL}>
              Entrar
            </a>
          </span>
          <a className="button button-primary" href={PRE_CADASTRO_URL}>
            Criar minha rede
          </a>
        </div>
      </div>
    </header>
  )
}

function FlowCardsSection() {
  return (
    <section id="fluxos" className="agent-flow-section">
      <div className="mx-auto max-w-7xl">
        <div className="agent-flow-hero">
          <h2>Da regra ao atendimento, tudo com controle.</h2>
          <p>
            Você muda o contexto, testa a rotina e publica a rede quando estiver
            pronto para executar.
          </p>
          <div className="agent-flow-pill">
            <span />
            Rede ativa
          </div>
        </div>

        <div className="agent-flow-grid">
          <article className="agent-flow-card">
            <div className="flow-card-copy">
              <p className="flow-card-kicker">Regras do negócio</p>
              <h3>
                Revise preço, tom de voz e campanhas antes da rede atender
                clientes.
              </h3>
            </div>
            <PreviewFlowTable />
          </article>

          <article className="agent-flow-card">
            <div className="flow-card-copy">
              <p className="flow-card-kicker">Rede operacional</p>
              <h3>
                Atendimento, venda, suporte, marketing, compras e operação
                trabalham no mesmo contexto.
              </h3>
            </div>
            <AgentNetworkMap />
          </article>

          <article className="agent-flow-card">
            <div className="flow-card-copy">
              <p className="flow-card-kicker">Ações por situação</p>
              <h3>
                Cada pedido vira uma ação clara para a equipe acompanhar.
              </h3>
            </div>
            <SkillSnippet />
          </article>

          <article className="agent-flow-card">
            <div className="flow-card-copy">
              <p className="flow-card-kicker">Controle humano</p>
              <h3>
                Dados sensíveis e decisões importantes param para aprovação.
              </h3>
            </div>
            <GovernanceFlow />
          </article>
        </div>
      </div>
    </section>
  )
}

function PreviewFlowTable() {
  const rows = [
    ["Tabela de preços", "Pronto", "3m"],
    ["Follow-up de venda", "Revisando", "2m"],
    ["Campanha da semana", "Na fila", "aguarda"],
  ]

  return (
    <div className="preview-flow-table" aria-hidden="true">
      {rows.map(([name, status, time], index) => (
        <div className="preview-flow-row" key={name}>
          <div>
            <strong>{name}</strong>
            <span>{index === 0 ? "Produção" : "Rascunho"}</span>
          </div>
          <div>
            <span className={`preview-status preview-status-${index}`} />
            <strong>{status}</strong>
            <span>{time}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentNetworkMap() {
  const points = [
    [50, 14],
    [26, 33],
    [72, 34],
    [18, 62],
    [55, 58],
    [84, 67],
  ]

  return (
    <div className="agent-network-map" aria-hidden="true">
      <svg viewBox="0 0 320 180">
        <path className="map-arc" d="M25 160C42 70 100 24 160 24s118 46 135 136" />
        <path className="map-arc" d="M70 160C82 92 116 44 160 24c44 20 78 68 90 136" />
        <path className="map-arc" d="M160 24v136" />
        <path className="map-arc" d="M42 108h236" />
        {points.map(([x, y]) => (
          <g className="map-node" key={`${x}-${y}`}>
            <circle cx={(x / 100) * 320} cy={(y / 100) * 180} r="8" />
            <path
              d={`M ${(x / 100) * 320 - 3} ${(y / 100) * 180 + 2} L ${
                (x / 100) * 320
              } ${(y / 100) * 180 - 3} L ${(x / 100) * 320 + 4} ${
                (y / 100) * 180 + 3
              } Z`}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}

function SkillSnippet() {
  const examples = [
    ["Cliente pediu preço", "Enviar proposta"],
    ["Venda esfriou", "Fazer follow-up"],
    ["Pedido atrasou", "Abrir suporte"],
    ["Precisa de aprovação", "Chamar humano"],
  ]

  return (
    <div className="skill-example" aria-hidden="true">
      {examples.map(([input, output]) => (
        <div className="skill-example-row" key={input}>
          <span>{input}</span>
          <strong>{output}</strong>
        </div>
      ))}
    </div>
  )
}

function GovernanceFlow() {
  const items = ["LGPD", "Humano", "Auditoria", "Política"]

  return (
    <div className="governance-flow" aria-hidden="true">
      <div className="governance-lines">
        {items.map((item, index) => (
          <div className="governance-line" key={item}>
            <span />
            <i className={index === 1 ? "is-green" : ""} />
          </div>
        ))}
      </div>
      <div className="governance-panel">
        {items.map((item, index) => (
          <div className="governance-chip" key={item}>
            <span className={index === 1 ? "is-green" : ""} />
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ink-950/10">
      <PerspectiveRoom />
      <FlowField />
      <div className="relative z-10 mx-auto grid min-h-[560px] max-w-7xl place-items-center px-4 py-12 sm:min-h-[640px] sm:px-6 sm:py-16 lg:min-h-[680px] lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.045em] text-ink-950 sm:text-6xl lg:text-7xl">
            Agentes autônomos para executar a rotina da empresa
          </h1>
          <p className="mx-auto mt-10 max-w-xl text-pretty text-lg leading-8 text-ink-600 sm:mt-16 sm:text-xl lg:mt-20">
            Atendem clientes, vendem, organizam tarefas internas e pedem
            aprovação quando a decisão precisa de humano.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a className="button button-primary button-large" href={PRE_CADASTRO_URL}>
              Criar minha rede
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

function OutcomeStrip() {
  return (
    <section className="border-b border-ink-950/10">
      <div className="mx-auto grid max-w-7xl gap-px bg-ink-950/10 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
        {outcomes.map((item) => (
          <article className="bg-page py-8 sm:px-6" key={item.label}>
            <p className="text-xl font-semibold tracking-[-0.02em] text-ink-950">
              {item.label}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-ink-600">
              {item.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function StartSection() {
  return (
    <section id="comeca" className="border-b border-ink-950/10 scroll-mt-16">
      <div className="mx-auto grid max-w-7xl px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
        <div className="flex flex-col justify-center py-16 lg:pr-14">
          <p className="eyebrow">Como começa</p>
          <h2 className="mt-6 max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-6xl">
            Primeiro cadastro, depois execução com dono.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-600">
            A Jotaduo começa pequena: entende a empresa, mostra lacunas e só
            libera o que estiver claro para a rede executar.
          </p>
        </div>

        <div className="grid border-t border-ink-950/10 lg:border-l lg:border-t-0">
          <div className="grid gap-px bg-ink-950/10 sm:grid-cols-3 lg:my-auto">
            {startSteps.map((step, index) => (
              <article className="bg-page p-6 sm:p-7" key={step.title}>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/16 bg-white/[0.04] text-sm font-semibold text-ink-950">
                  {index + 1}
                </span>
                <h3 className="mt-10 text-xl font-semibold tracking-[-0.02em] text-ink-950">
                  {step.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-ink-600">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function NetworkConsole() {
  return (
    <aside
      className="relative z-10 mt-14 overflow-hidden rounded-[28px] border border-ink-950/10 bg-white/[0.04] shadow-[0_40px_100px_-60px_rgba(255,255,255,0.45)] lg:mt-0"
      aria-label="Prévia da rede de agentes"
    >
      <div className="flex items-center justify-between border-b border-ink-950/10 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">
            Rede ativa
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-950">
            jotaduo.com/rede
          </p>
        </div>
        <span className="status-dot">ao vivo</span>
      </div>

      <div className="grid grid-cols-3 border-b border-ink-950/10">
        <Metric value="Menos" label="fila" />
        <Metric value="24h" label="resposta" />
        <Metric value="Humano" label="no controle" />
      </div>

      <div className="divide-y divide-ink-950/10">
        {networkRows.map((row) => (
          <div className="grid grid-cols-[1fr_auto] gap-5 px-5 py-4" key={row.channel}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="truncate text-sm font-semibold text-ink-950">
                  {row.channel}
                </p>
              </div>
              <p className="mt-1 truncate text-sm text-ink-500">{row.function}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-ink-950">{row.state}</p>
              <p className="mt-1 text-xs text-ink-500">{row.time}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.06] px-5 py-5 text-white">
        <p className="text-sm font-medium">Próxima decisão</p>
        <p className="mt-2 text-sm leading-6 text-white/68">
          A rede executa o que é repetível e separa o que precisa de aprovação,
          contexto novo ou revisão humana.
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
          kicker="Base única"
          title="Uma memória de trabalho para a empresa inteira."
          body="A empresa deixa de depender de orientações soltas. Regras, canais, preços e histórico alimentam agentes que executam sem perder controle."
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
            kicker="Menos tarefa manual"
            title="A rede assume o repetitivo e mostra o que precisa de decisão."
            body="Atendimento, venda, suporte, compras, marketing, relatórios, testes e políticas internas entram em uma operação supervisionada."
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
              <div className="rounded-2xl border border-ink-950/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">
                      Rede pronta para executar
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      Memória revisada · ações em andamento · humano em alerta
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
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
          Feito para empresas que precisam tirar trabalho recorrente da equipe
          sem abrir mão de controle humano.
        </p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-ink-950/10 bg-ink-950/10 sm:grid-cols-4">
          <ProofMetric value="24h" label="atendimento ativo" />
          <ProofMetric value="1" label="memória por empresa" />
          <ProofMetric value="Humano" label="aprova exceções" />
          <ProofMetric value="Histórico" label="auditável" />
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
              A mesma rede cuida do cliente, da venda e da operação.
            </h2>
          </div>
          <a className="button button-secondary w-fit" href={`mailto:${SUPPORT_EMAIL}`}>
            Falar com a equipe
          </a>
        </div>

        <div className="grid gap-px overflow-hidden rounded-[28px] border border-ink-950/10 bg-ink-950/10 lg:grid-cols-3">
          {useCases.map((item) => (
            <article className="bg-white/[0.04] p-7 sm:p-8" key={item.title}>
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
          Monte a primeira rede e tire trabalho repetitivo da equipe.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-600">
          Em poucos minutos a Jotaduo entende o negócio, encontra pendências e
          prepara agentes para executar com revisão humana quando necessário.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a className="button button-primary button-large" href={PRE_CADASTRO_URL}>
            Montar rede inicial
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
    <footer className="border-t border-ink-950/10 bg-page">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div className="flex flex-col gap-2">
          <LogoMark />
          <p className="text-sm text-ink-500">Rede de agentes para empresas</p>
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
    <div className="bg-white/[0.04] p-6 text-center">
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
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
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

function FlowField() {
  return (
    <svg
      className="hero-flows"
      viewBox="0 0 1080 640"
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flowGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0" />
          <stop offset="48%" stopColor="#a7f3d0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="flowRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fecaca" stopOpacity="0" />
          <stop offset="45%" stopColor="#fecaca" stopOpacity="0.82" />
          <stop offset="100%" stopColor="#fecaca" stopOpacity="0" />
        </linearGradient>
        <filter id="flowGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path id="flow-support" d="M98 470 L540 330 L982 470" />
      <path id="flow-sales" d="M222 88 L540 316 L858 88" />
      <path id="flow-context" d="M540 92 L540 316 L540 568" />
      <path id="flow-ops" d="M166 168 L540 316 L914 168" />

      <g className="flow-static">
        <use href="#flow-support" />
        <use href="#flow-sales" />
        <use href="#flow-context" />
        <use href="#flow-ops" />
      </g>

      <g className="flow-streaks" filter="url(#flowGlow)">
        <use className="flow-streak flow-streak-a" href="#flow-support" />
        <use className="flow-streak flow-streak-b" href="#flow-sales" />
        <use className="flow-streak flow-streak-c" href="#flow-context" />
        <use className="flow-streak flow-streak-d" href="#flow-ops" />
      </g>

      <g className="flow-packets">
        <circle r="5">
          <animateMotion dur="7.4s" repeatCount="indefinite" rotate="auto">
            <mpath href="#flow-support" />
          </animateMotion>
        </circle>
        <circle r="4">
          <animateMotion
            begin="-2.1s"
            dur="8.2s"
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href="#flow-sales" />
          </animateMotion>
        </circle>
        <circle r="4">
          <animateMotion
            begin="-4.4s"
            dur="6.6s"
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href="#flow-context" />
          </animateMotion>
        </circle>
      </g>
    </svg>
  )
}

function LogoMark() {
  return (
    <img
      src="/jota-duo-logo.png"
      alt="Jota Duo"
      className="brand-logo"
      decoding="async"
    />
  )
}
