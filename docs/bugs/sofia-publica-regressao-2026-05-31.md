# Relatório — Sofia no tenant público (teste11) está estranha

**Data:** 2026-05-31
**Tenant testado:** https://teste11.jotaduo.com/ (perfil `public`)
**Método:** teste real via navegador (agent-browser) + auditoria de código
**Veredicto:** funil **funciona** (Sofia responde, abre proativa), mas há **1 bug
grave de coerência de conversa**, **latência inaceitável**, e **fonte de verdade
fragmentada em 4 lugares** que já gerou contradições internas no produto.

---

## 1. O que foi observado no navegador

Transcrição real da sessão de teste:

| Turno | Eu (visitante) | Sofia |
|---|---|---|
| 1 | "Oi! Tenho uma clínica de odontologia em Curitiba e quero automatizar o atendimento no WhatsApp" | "Que bom que chegou. Sou a Sofia, consultora de discovery da Jotaduo. A Jotaduo **monta uma equipe de agentes** de atendimento [...] Antes de qualquer coisa: como prefere que eu te chame, e qual o nome da clínica?" |
| 2 | "Pode me chamar de **Eduardo**, a clínica é **OdontoCuritiba**" | "Anotado — **Unimed e Bradesco, particular e convênio.** Como o paciente marca consulta hoje — ele liga, manda WhatsApp, acessa algum site ou app?" |

- A abertura (turno 1) está boa em forma, mas viola a própria regra de identidade (ver §2.A).
- O turno 2 é o **bug grave**: ⬇️

---

## 2. Erros encontrados (ranqueados)

### 🔴 P0 — Sofia alucina respostas e ignora o que o visitante diz

No turno 2 eu disse meu nome (Eduardo) e o nome da clínica (OdontoCuritiba).
A Sofia:

1. **Ignorou completamente** os dois dados que pedi pra ela registrar no turno anterior.
2. **Inventou** "Unimed e Bradesco, particular e convênio" — eu **nunca** disse isso.
3. **Pulou fases** e foi direto pra pergunta nº 3 do roteiro de clínica.

**Causa-raiz (confirmada no código):**

- "Unimed" é texto de **exemplo** em
  [`workspace/skills/jotaduo-discovery/assets/exemplo-dossie.json:43`](workspace/skills/jotaduo-discovery/assets/exemplo-dossie.json)
  (`"atende particular e Unimed"`).
- A pergunta que ela fez é **cópia quase literal** da linha 15 de
  [`workspace/skills/jotaduo-discovery/references/segments/clinica.md:15`](workspace/skills/jotaduo-discovery/references/segments/clinica.md).

Ou seja: a Sofia carregou o reference do segmento clínica (fase 3 do roteiro),
**parroteou um exemplo do arquivo como se fosse resposta real do visitante**,
e marchou mecanicamente pela lista de perguntas do `.md` — exatamente o
comportamento "checklist" que a const
[`publicSofiaAgentMD`](internal/saas/tenant/workspace.go:187) manda evitar
("Você é consultora, não checklist", "UMA pergunta por vez", "Reflita o que
ouviu antes de seguir", "sem pular fase").

Isso é parte **qualidade do modelo** (claude-cli Sonnet via subscription é fraco
em separar exemplo de diálogo real — ver memória `project_claude_cli_provider`)
e parte **design de prompt**: a const tem ~180 linhas e ainda manda abrir
arquivos de referência grandes no meio da conversa, o que dilui o estado real.

### 🔴 P0 — Latência de ~90s por resposta

Cada turno levou **80–100 segundos** pra primeira resposta aparecer (sequência
de status na UI: "Pensando…" → "Preparando resposta…" → "Analisando sua
solicitação…"). Pra um visitante anônimo isso é abandono garantido.

Provável combinação de: modelo claude-cli subscription lento + a const instruir
leitura de arquivos de referência (cada leitura = uma rodada interna extra, como
a própria const reconhece na linha 226 "NÃO releia… deixa a resposta lenta").
Vale confirmar se o token claude-cli expirou de novo (histórico de expirar 3×,
último 30/05 — memória `project_claude_cli_provider`).

### 🟠 P1 — Contradições internas de identidade (a "estranheza" que você sentiu)

A const define regras de identidade **CRÍTICAS** e o produto as viola em 2 pontos:

1. **"equipe de agentes" — proibido, mas usado.**
   [`workspace.go:237-238`](internal/saas/tenant/workspace.go): *"**NUNCA** se
   apresente como Rafael, picoclaw […] ou **'equipe de agentes'**."*
   A abertura ao vivo: *"A Jotaduo **monta uma equipe de agentes** de
   atendimento."* — limítrofe (descreve o produto, não a si mesma), mas é
   exatamente o termo que a regra tenta banir, e soa robótico.

2. **"cadastro" — proibido, mas é o subtítulo da tela.**
   [`workspace.go:288`](internal/saas/tenant/workspace.go): *"NÃO […] fale em
   **'cadastro'**"*. Mas o frontend mostra, fixo, o subtítulo
   **"Te ajudo a completar o cadastro."**
   ([`web/frontend/src/components/chat/chat-empty-state.tsx`](web/frontend/src/components/chat/chat-empty-state.tsx),
   `AGENT_INTRO_BY_KEY.sofia`). O frontend contradiz a regra do backend.

### 🟡 P2 — Vazamentos de UI do launcher genérico no chat público

- **Placeholder do input:** "Pedir alterações adicionais" — texto do chat
  genérico do launcher, sem sentido num onboarding ("alterações de quê?").
- **Heading da empty-state:** "Oi, sou Sofia. **O que vamos resolver agora?**"
  — saudação genérica do launcher, diferente da abertura real que a Sofia
  manda no primeiro turno. O visitante vê **três** saudações diferentes
  (heading, subtítulo, e a 1ª mensagem real da Sofia).
- **Polling agressivo:** a UI faz dezenas de `GET /api/gateway/status` em
  rajada — comportamento de console de operador, desnecessário numa superfície
  pública anônima.

### 🟡 P2 — Sessão anônima não persiste no reload

Recarregar a página zera a conversa. Pode ser by-design, mas se o visitante
fecha sem querer, perde todo o discovery — ruim pro funil.

---

## 3. Incoerência workspace ↔ injeção: a fonte de verdade está em 4 lugares

A identidade/abertura da Sofia pública hoje está definida — com texto
**divergente** — em quatro lugares, cada um com um caminho de deploy diferente:

| # | Fonte | Arquivo | Abertura/identidade | Pra mudar exige |
|---|---|---|---|---|
| 1 | **Const Go** (autoritativa em runtime) | [`internal/saas/tenant/workspace.go:169`](internal/saas/tenant/workspace.go) `publicSofiaAgentMD` → escrita em `workspace/AGENT.md` quando `IsPublic` via `ApplyPublicSofiaAgentMD` | "Você é a Sofia, consultora de discovery… A gente cria atendentes de IA sob medida…" | **rebuild Go + release de imagem** |
| 2 | **Skill** | [`workspace/skills/jotaduo-discovery/SKILL.md`](workspace/skills/jotaduo-discovery/SKILL.md) (Abertura Fase 1) | "Oi! Eu sou a Sofia, da Jotaduo. A gente cria atendentes de IA sob medida…" | edição workspace + `make sync-baseline` |
| 3 | **Agente canonical (modo cliente)** | [`workspace/agents/sofia/AGENT.md`](workspace/agents/sofia/AGENT.md) | "Sou a Sofia, consultora de discovery…" | edição workspace + sync |
| 4 | **Frontend hardcoded** | [`web/frontend/src/components/chat/chat-empty-state.tsx`](web/frontend/src/components/chat/chat-empty-state.tsx) | heading "Oi, sou Sofia. O que vamos resolver agora?" + "Te ajudo a completar o cadastro." | rebuild frontend |

O #2 (skill) é **conteúdo morto e perigoso**: a const (linha 226-233) proíbe
a Sofia de reler o `SKILL.md` por turno, então essa abertura nunca roda — mas
fica lá divergindo, e qualquer dev que editar achando que é a fonte real não
verá efeito nenhum em produção. Foi provavelmente uma dessas edições "que não
surtiu efeito" que te deu a sensação de regressão.

---

## 4. Melhor caminho: uma única fonte de verdade

**Princípio:** o arquivo de workspace é a fonte; o Go só **seleciona/copia**, não
embute texto. Frontend deriva ou no mínimo não contradiz.

### Passo 1 — Tirar o prompt da const Go e pôr num arquivo de workspace
Mover o conteúdo de `publicSofiaAgentMD` para um arquivo versionado, ex.:

```
workspace/agents/sofia/AGENT.public.md      (modo discovery / público)
workspace/agents/sofia/AGENT.md             (modo cliente — já existe)
```

`ApplyPublicSofiaAgentMD` passa a **ler `AGENT.public.md` do volume** (copiado
junto no `CopyWorkspaceHome`) em vez de embutir string Go. Ganho:

- editar a voz da Sofia = editar 1 `.md` + `make sync-baseline`, **sem rebuild
  Go, sem release de imagem**.
- o `make sync-baseline` (`internal/saas/api/baseline-workspace/`) já garante
  que novos tenants peguem a versão nova — o mecanismo de propagação já existe.

### Passo 2 — Matar a abertura duplicada da skill
Remover a seção "Abertura (Fase 1)" com texto de saudação de
`jotaduo-discovery/SKILL.md` e deixar lá só o **roteiro/mecânica**. A saudação
mora só no `AGENT.public.md`. Assim a skill nunca mais diverge da persona.

### Passo 3 — Frontend deixa de contradizer o backend
- Remover o subtítulo fixo "Te ajudo a completar o cadastro" (viola a regra
  "sem 'cadastro'") e a heading genérica "O que vamos resolver agora?".
- Ideal: a empty-state da Sofia pública **não inventa saudação** — deixa a 1ª
  mensagem real da Sofia (que ela já manda proativa) ser a saudação. Ou puxa de
  um único campo servido pelo backend (ex. `ui-visibility.json`/policy).
- Trocar o placeholder do input no perfil `public` de "Pedir alterações
  adicionais" para algo do onboarding (ex. "Escreva sua mensagem…").

### Passo 4 (separado, P0) — Corrigir a alucinação
Não é problema de fonte de verdade, é de execução:
- **Curto prazo:** na const/`AGENT.public.md`, endurecer a fase 3 — proibir
  carregar o `segments/<seg>.md` antes de ter **confirmado nome + segmento do
  visitante**, e mandar **sempre reafirmar o último dado recebido** antes de
  perguntar o próximo ("Anotado: Eduardo, OdontoCuritiba. Agora…"). Reduz o
  parroting de exemplo.
- **Estrutural:** tirar dados de exemplo realistas (Unimed/Bradesco) dos
  arquivos que a Sofia lê em runtime, ou marcá-los como `<!-- EXEMPLO, não é
  dado do cliente -->`. O modelo está confundindo exemplo com diálogo.
- **Causa de fundo:** validar se o claude-cli token não expirou e medir se um
  modelo mais forte (ou Anthropic Messages API direto) elimina o parroting —
  isso também ataca a latência de §2.

---

## 5. Resumo executivo

- ✅ Funil vivo: Sofia abre, conduz, identidade correta na maior parte.
- 🔴 **Bug real (não é impressão):** Sofia ignora e inventa respostas (parroting
  de exemplo dos `.md`), e demora ~90s por turno.
- 🟠 A "estranheza" = **4 fontes de verdade divergentes**; edições no `SKILL.md`
  (fonte #2) não surtem efeito porque a const (fonte #1) é a que roda.
- 🎯 **Fonte única:** prompt da Sofia pública vira `AGENT.public.md` no
  workspace; Go só copia; skill perde a saudação; frontend para de contradizer.

---

## 6. Implementado nesta sessão (2026-05-31)

✅ **Passo 1 — fonte única (Go só copia):**
- Novo arquivo versionado [`workspace/agents/sofia/AGENT.public.md`](workspace/agents/sofia/AGENT.public.md)
  com o prompt completo da Sofia pública (= conteúdo da antiga const + correções).
- [`internal/saas/tenant/workspace.go`](internal/saas/tenant/workspace.go): a
  const inline `publicSofiaAgentMD` (~180 linhas) foi **removida**;
  `ApplyPublicSofiaAgentMD` agora **lê** `agents/sofia/AGENT.public.md` do
  volume (const de caminho `publicSofiaAgentSrcRel`). Falha alto se o seed
  estiver velho (sem o arquivo), em vez de bootar a persona cliente no público.
  → Editar a voz da Sofia = editar o `.md` + `make sync-baseline`, **sem rebuild Go**.
- Testes atualizados + novo `TestApplyPublicSofiaAgentMD_MissingSofiaPromptFails`
  (`workspace_agentmd_test.go`). `go test ./internal/saas/tenant/` ✅.

✅ **Passo 2 — matar saudação duplicada:** a "Abertura (Fase 1)" de
[`jotaduo-discovery/SKILL.md`](workspace/skills/jotaduo-discovery/SKILL.md) não
traz mais texto canônico de saudação — só a mecânica + ponteiro pro
`AGENT.public.md` como fonte. Acaba o conteúdo morto que divergia.

✅ **Passo 3 — frontend para de contradizer:**
- [`chat-empty-state.tsx`](web/frontend/src/components/chat/chat-empty-state.tsx):
  subtítulo da Sofia/onboarding deixou de ser "Te ajudo a completar o cadastro"
  (violava a regra "sem 'cadastro'") → "Entendo seu negócio e desenho seu time
  de atendimento de IA."
- Placeholder do input "Pedir alterações adicionais" → "Escreva sua mensagem"
  (pt-br, en, zh).

✅ **Passo 4 (parcial) — anti-alucinação no prompt:** nova seção *"Fidelidade
ao que o visitante disse"* no `AGENT.public.md`: proíbe inventar dados, exige
reafirmar o último dado antes da próxima pergunta, e marca explicitamente que
exemplos dos arquivos de segmento (ex. "Unimed") **não são** respostas do
visitante. Fase 3 só carrega o arquivo de segmento após confirmar nome+segmento.

⏳ **Não resolvido (infra, fora de código):** latência ~90s/turno e a causa de
fundo da alucinação (qualidade do modelo claude-cli subscription / token
expirado). Precisa validar token e/ou trocar pra Anthropic Messages API direto
— ver memória `project_claude_cli_provider`.

`make sync-baseline` rodado (baseline 284→285 arquivos, `status: synced`).
Validação: `go build ./internal/saas/...` ✅, `go vet` ✅, testes ✅,
`make check-baseline-sync` ✅. Deploy via GHA (push → GHCR → timer).
