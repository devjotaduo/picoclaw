# Relatório — teste E2E "Tenant publico + Sofia discovery" em prod

**Data:** 2026-05-27 02:48 UTC
**Executor:** Claude (sessão Playwright)
**Tenant criado:** `padaria-teste-sofia` (subdomain `padaria-teste-sofia.jotaduo.com`, container `tenant-padaria-teste-sofia-fbf29a`)
**Admin usado:** `rutherles@gmail.com`
**Controlplane image em prod no momento do teste:** `sha256:1ca88dae063c` (built 02:38 UTC — **inclui PR #128 mergeada às 02:37**)

## TL;DR

O fluxo wizard → tenant criado funcionou. Mas a **conversa com Sofia
não funciona** por **4 bugs independentes** que se manifestam ao
mesmo tempo. Nenhum deles é resolvido pela PR #128 sozinha — ela ataca
1 deles parcialmente. As outras 3 camadas precisam de PRs separadas.

---

## ✅ O que funcionou

| Item | Status | Observação |
|---|---|---|
| Login admin em `adm.jotaduo.com` | ok | Sem MFA, formulário simples |
| Sidebar de operação | ok | Estrutura "Operação / Clientes / Modelos / Comercial / Plataforma" carregou normal |
| Wizard `/tenants/new` | ok | 3 cards (Cliente / Equipe / Público) bem visíveis |
| Seleção do card "Público" | ok | Form se adapta: oculta campo "Responsável" + mostra "Não se aplica" |
| Submissão do form | ok | Tenant provisionado em ~15s (resposta visual: dialog "Cliente pronto") |
| Container Docker criado | ok | `tenant-padaria-teste-sofia-fbf29a` running, healthy |
| Provisioner aplicou Sofia AGENT.md (**fatia da PR #128**) | ok | `workspace/AGENT.md` no volume tem o conteúdo `name: sofia-discovery-mode` — **a parte do provisioner funcionou** |
| ui-visibility.json escrito com profile correto | ok | `active_profile: "public"` no volume |
| Subdomain `padaria-teste-sofia.jotaduo.com` rotou via Traefik | ok | TLS válido, SPA carregou |
| WebSocket pico conectou | ok | Banner "Conectado" no header |

---

## ❌ O que falhou

### Bug 1 — UI mostra "Oi, sou Rafael" como saudação estática (NÃO vem do LLM)

**Sintoma:** ao abrir o chat pela primeira vez, antes de mandar
qualquer mensagem, o card central exibe:

> **"Oi, sou Rafael. O que vamos resolver agora?"**
> "Cuido dos bastidores e chamo a pessoa certa."

**Diagnóstico:** confirmei via SSH que `workspace/AGENT.md` no volume
do tenant é o conteúdo da PR #128 (`name: sofia-discovery-mode`, com
proibição explícita de se apresentar como Rafael). Mas o greeting
aparece ANTES de qualquer chamada LLM acontecer — é renderizado pelo
frontend.

`config.json::ui.chat_intro` está `null`. Então o greeting está
**hardcoded em algum componente React** do launcher SPA.

**Por que PR #128 não resolve:** ela troca a persona LLM (que sim,
fica Sofia depois da primeira interação real). Mas o frontend renderiza
"Rafael" como apresentação inicial independente de qual persona o
backend usa.

**Onde fixar:** `web/frontend/src/...` — buscar o componente que
renderiza "sou Rafael" e deixar dinâmico via active_profile ou via
config (`ui.chat_intro` lido por persona).

---

### Bug 2 — Banner + tour "Cadastro incompleto" em tenant público

**Sintoma:**
- Banner topo: "Cadastro incompleto — 10 informações ainda precisam ser preenchidas"
- Tour modal: "Cadastro incompleto. Faltam algumas informações da empresa..."

Ambos tratam o visitante anônimo como se fosse o dono do tenant que
precisa completar onboarding da própria empresa. Confundem completamente
o visitante que veio se cadastrar.

**Diagnóstico:** `ui-visibility.json::active_profile = "public"` ESTÁ
correto no volume e tem `chat.quick_tasks: false`, `chat.session_history: false`,
etc. Mas o banner "Cadastro incompleto" **não está nessa lista de
visibilidade**. Está sendo renderizado incondicionalmente porque o
`useCompanyOnboarding` hook (ou similar) reporta que a memória da
empresa está vazia.

**Por que aparece:** em tenant público o `memory/empresa.md` está vazio
**por design** (ainda não houve discovery), e o frontend interpreta
isso como "dono não terminou o cadastro" em vez de "estamos esperando
o visitante começar o discovery". A semântica de "10 informações
faltando" é cliente-cêntrica.

**Onde fixar:** o frontend precisa checar `active_profile === "public"`
ANTES de renderizar o banner de cadastro incompleto e o tour. Já tem
o profile carregado via PR #109 — só precisa wire o gate.

---

### Bug 3 — LLM 400 `Invalid model name passed in model=gpt-5.4`

**Sintoma:** mandei "oi quem e voce" no chat. Resposta:

> Rafael • 11:48 PM
> "Error processing message: LLM call failed after retries: API request failed: Status: 400 Body: {"error":{"message":"/chat/completions: Invalid model name passed in model=gpt-5.4..."

**Diagnóstico:** o `config.json` do tenant tem:
```json
{
  "agents": {"defaults": {"model_name": "default"}},
  "model_list": [{
    "model_name": "default",
    "provider": "openai",
    "model": "gpt-5.4",
    "api_base": "http://litellm:4000"
  }]
}
```

LiteLLM tem **13 modelos registrados** (`gpt-4o`, `claude-sonnet-4-5`,
`claude-haiku-4-5`, `gemini-2.0-flash`, etc.). **`gpt-5.4` NÃO existe**.

**Origem:** o source template em `/srv/picoclaw-workspaces/default-business/home/config.json`
também tem essa config bugada. **Toda criação nova de tenant
(cliente OU público) herda esse model_list quebrado.** Não é específico
do bug de público.

**Onde fixar:** atualizar o source template:
```bash
ssh root@155.138.210.187
# Editar /srv/picoclaw-workspaces/default-business/home/config.json
# Trocar "model": "gpt-5.4" por "model": "claude-sonnet-4-5"
# OU "model": "gpt-4o" (qualquer um dos 13 que LiteLLM tem)
```

Validação ideal: o `ValidateBundle` (PR #104 strict config) deveria
rejeitar `model:` que não resolve em LiteLLM. Hoje só valida shape do
JSON, não semântica. Issue de melhoria a longo prazo.

---

### Bug 4 — Persona attribution "Rafael" no header da bolha de resposta (mesmo no erro)

**Sintoma:** quando o LLM 400 retornou, a bolha de erro foi atribuída
a "Rafael • 11:48 PM" — não a "Sistema" nem a "Sofia".

**Diagnóstico:** o frontend assume que toda mensagem do agente vem do
"agente principal" e label é estática. Em tenants públicos a label
deveria ser Sofia (porque o AGENT.md desse tenant É Sofia agora).

**Onde fixar:** mesmo lugar do Bug 1 — componente que renderiza nome
do agente na bolha. Deve ler o nome do persona ativo (do `AGENT.md`
metadata) em vez de hardcoded "Rafael".

---

### Bug menor 5 — `/tenants` (lista de clientes) conta "0 total" embora existam tenants em prod

**Sintoma:** página `/tenants` no admin painel mostra "0 total" e tela
"Nenhum cliente ainda" — mas eu sei (via SSH) que existem 6+ tenants
rodando. Provavelmente filtra por `is_public=false` e mostra só
clientes. Pra ver públicos teria que ir em `/tenants/discovery`?

**Impacto:** operador pode achar que "não tem nenhum tenant" e criar
duplicatas, perder track de quantos públicos estão ativos, não
revogar/limpar inativos.

**Onde fixar:** essa página chama-se "Clientes" mas o conceito interno
é "Tenants". Ou renomear pra "Clientes" e adicionar uma página "Públicos"
separada, ou unificar com filtro por tipo (cliente/admin/publico/todos).

---

## 🔧 Análise: por que PR #128 ajudou pouco

A PR #128 fez o que prometeu: **provisioner sobrescreve AGENT.md em
tenant público com prompt Sofia-mode**. Isso funcionou — confirmei o
arquivo no volume. Mas isso é só **1 das 4 camadas** do bug:

| Camada | Estado |
|---|---|
| **LLM persona** (AGENT.md determina quem o agente "é") | ✅ Sofia (PR #128 funcionou) |
| **Frontend greeting estático** ("Oi, sou Rafael" no card inicial) | ❌ ainda Rafael |
| **Frontend chat bubble label** ("Rafael • 11:48 PM" no header) | ❌ ainda Rafael |
| **Frontend banners cliente-cêntricos** ("Cadastro incompleto") | ❌ ainda visíveis |
| **Backend LLM call** | ❌ 400 (model name bogus, pré-existente) |

Mesmo se eu fixar o modelo, o visitante ainda vê "Oi, sou Rafael",
banner "cadastro incompleto", e quando Sofia responder a label vai ser
"Rafael". A experiência continua quebrada.

---

## 📋 Melhorias priorizadas

### P0 (bloqueia funcionamento) — fix imediato

1. **Atualizar source workspace `config.json` pra ter model válido.**
   `sshsh root@155.138.210.187` + editar
   `/srv/picoclaw-workspaces/default-business/home/config.json` trocando
   `model: "gpt-5.4"` por `model: "claude-sonnet-4-5"`. Re-cria padaria
   e testa.
   *Esforço: 5 min. Sem PR, é fix de dado.*

### P1 (fluxo público parece bug) — PR

2. **Frontend: remover greeting hardcoded "sou Rafael" e ler do
   AGENT.md ou de `config.json::ui.chat_intro`.** Permitir que o
   provisioner injete `ui.chat_intro` em tenants públicos como
   "Oi, sou Sofia da Jotaduo. Vou te fazer algumas perguntas pra
   entender seu negócio. Pra começar: qual o nome da sua empresa?"
   *Esforço: 1-2h. Adicionalmente: a primeira mensagem da Sofia hoje
   só roda quando o visitor manda "oi" — proatividade fica pra próximo.*

3. **Frontend: gate "Cadastro incompleto" banner + tour por
   `active_profile != "public"`.** O hook que renderiza essa
   notificação precisa checar profile antes.
   *Esforço: 30min.*

4. **Frontend: persona label das bubbles deve vir do AGENT.md
   frontmatter ou do active_profile**, não hardcoded "Rafael".
   *Esforço: 1h.*

### P2 (qualidade de operação)

5. **Painel admin: página "Tenants" (não só "Clientes") com filtro
   por tipo.** Hoje a tela `/tenants` só mostra cliente e diz "0 total",
   misleading.
   *Esforço: 2h.*

6. **ValidateBundle: validar que `model_list[].model` resolve em
   `/v1/models` do LiteLLM antes de aceitar upload do workspace.**
   Pega na hora do upload em vez de na primeira mensagem do tenant.
   *Esforço: 3h.*

### P3 (operacional)

7. **Backup do source workspace `/srv/picoclaw-workspaces/` no R2 daily.**
   Sem isso, qualquer edit manual mal feito quebra todos novos tenants
   silenciosamente. Hoje só os `tenants/` estão no backup.
   *Esforço: 1h.*

---

## 📷 Evidências

- Screenshot: `.playwright-mcp/bug-publico-rafael-erro-llm.png` (chat
  com Rafael greeting + erro LLM)
- Tenant container: `tenant-padaria-teste-sofia-fbf29a` ainda rodando
  (não deletei pra você inspecionar se quiser)
- Volume com config quebrado:
  `/srv/saas/tenants/padaria-teste-sofia-fbf29a/`
- Logs Traefik confirmaram que jotaduo-wa-pair routing funciona
  (não testei envio WA porque o agent nem virou Sofia ainda)

---

## ✋ O que NÃO testei (porque os bugs acima bloquearam)

- Sofia conduzindo discovery em 8 fases — agente nem respondeu
- Phase 7.5 captura nome+email+WhatsApp — não chegou nesse ponto
- Skill `enviar-whatsapp-jotaduo` end-to-end (Catarina mandando WA real
  pro lead) — depende de Sofia primeiro
- Skill `verificar-respostas-jotaduo` (Catarina lendo inbox) —
  idem, depende
- Promoção do tenant → cliente — depende de Sofia + Catarina terem
  rodado primeiro
- `RestoreClienteAgentMD` na hora do promote (PR #128) — não cheguei
  no momento do promote
- Revoke de jotaduo-wa routing no promote (fatia 5) — idem

**Próximo teste**: fazer fix P0 (modelo) + fix P1 #2 e #3 (frontend),
re-criar tenant publico, validar fluxo completo Sofia → Catarina →
promote.

---

## 📝 Conclusão executiva

A infraestrutura está pronta (sidecar deployado, PR #128 ativa, Traefik
ok, provisioner injeta tudo certo). **O bloqueio agora é frontend +
config de modelo.** São mudanças pequenas (talvez 5-8 horas de dev)
e completamente paralelizáveis com qualquer outro trabalho.

Sem isso, todo novo tenant público vai dar a mesma impressão pro
visitante: "site quebrado, agente confuso, perguntando por dados que eu
não sei o que é". Risco de o visitante abandonar antes da primeira
pergunta real.
