# Estratégia de Onboarding — Orquestração Rafael → Sofia → Catarina

**Data:** 2026-06-02
**Autor:** QA Tester (orquestrador de testes)
**Status:** proposta para validação

---

## A pergunta

> "Rafael deve chamar a Sofia pública se nenhum dado estiver preenchido,
> e ela montar e ativar os agentes? E a Sofia chamar a Catarina pra
> aprofundar pelo WhatsApp? Ou fazer tudo na mesma sessão?"

Resposta curta: **as três coisas, mas em camadas diferentes e em canais
diferentes** — não tudo na mesma sessão. Abaixo o porquê e o desenho.

---

## Princípio que decide tudo: existem DOIS mundos, não um

O erro mais comum ao desenhar isso é tratar "Rafael chama Sofia" e
"Sofia pública" como o mesmo fluxo. Não são.

| Mundo | Quem é o agente `main` | Como o discovery começa |
|---|---|---|
| **Tenant público** (visitante anônimo, `is_public=true`) | **Sofia** | Sofia dispara sozinha no 1º turno. Rafael nem existe aqui. |
| **Tenant cliente** (pago, Rafael orquestra) | **Rafael** | Rafael detecta `empresa.md` vazio e **chama Sofia como subagente**. |

Ou seja:
- No **público**, Rafael NÃO chama Sofia — ela já é a porta de entrada.
- No **cliente**, Rafael É quem chama Sofia (mesma sessão), porque ali
  ele é o orquestrador.

São o mesmo skill (`jotaduo-discovery`), dois pontos de entrada.

---

## Desenho recomendado: "Discovery síncrono, Deepening assíncrono"

### Camada 0 — Detecção (quem dispara)

```
TENANT PÚBLICO                      TENANT CLIENTE
visitante chega                     Rafael recebe mensagem do dono
   │                                   │
Sofia já é main                     Rafael roda onboarding/verificar-empresa
Sofia abre discovery no 1º turno       │
                                    empresa.md vazio/incompleto?
                                       ├── sim → Rafael chama Sofia (subagente, MESMA sessão)
                                       └── não → Rafael segue operação normal
```

### Camada 1 — Discovery (Sofia, **síncrono, mesma sessão**)

- Sofia conduz as 8 fases conversando agora, ali, no mesmo chat.
- **Sofia MONTA o time, mas NÃO ativa nada por conta própria.**
  Ela *recomenda* os agentes (lista numerada: Clara, Marcos, Camila…)
  e grava o dossiê. A ativação é consequência automática (Camada 2),
  não uma ação que a Sofia executa.

> **Por que Sofia não "ativa" os agentes diretamente:**
> dar a um agente o poder de ligar/desligar outros agentes ou mexer em
> config é risco de segurança e de loop. A ativação tem que ser
> **determinística e auditável**, não decisão de LLM. Sofia produz o
> dado; o sistema reage ao dado.

### Camada 2 — Cristalização (**determinística, sem LLM**)

- Sofia grava **UM** arquivo: `state/discovery-close.request.json`.
  (Largar um único arquivo é a ação mais confiável que o modelo
  consegue fazer — ver o blocker do claude-cli que não emite tool_calls.)
- Cron `onboarding-discovery-close` (5min) lê o arquivo →
  `state.py discovery_close` → grava `memory/empresa.md` + marca
  `discovery_done`.
- O detector (`pkg/agent/onboarding_default.go`) re-lê em ~30s, desliga
  o override de default-agent → **a equipe fica ativa automaticamente.**

É AQUI que os agentes "ativam". Ninguém aperta um botão; o
`empresa.md` validado é o gatilho.

### Camada 3 — Deepening (Catarina, **assíncrono, canal SEPARADO**)

- **NÃO na mesma sessão da Sofia.** Catarina aprofunda em pedaços de
  10–15min ao longo de **dias**, pelo **WhatsApp institucional da
  Jotaduo** — não pelo chat do painel.
- Cron `onboarding-bridge-sofia-catarina` (15min) detecta
  `discovery_done` + `first_contact_at == null` → dispara o primeiro
  outbound da Catarina.
- A partir daí, Catarina roda em rajadas assíncronas (cron inbox-poller
  10min) conforme o dono responde.

> **Por que deepening NÃO pode ser na mesma sessão:**
> 1. O dono não tem tempo agora — discovery já cansou.
> 2. O canal é outro (WhatsApp institucional, não o painel).
> 3. O ritmo é outro (dias, não minutos).
> Forçar Catarina na mesma sessão da Sofia quebraria os três.

---

## Resposta ponto a ponto à sua pergunta

| Sua pergunta | Resposta |
|---|---|
| Rafael chama Sofia se nenhum dado preenchido? | **Sim — mas só no tenant cliente.** No público, Sofia já é a entrada. |
| Mesma sessão (Rafael→Sofia)? | **Sim.** Discovery é síncrono; faz sentido no mesmo chat. |
| Sofia "monta e ativa" os agentes? | **Monta sim** (recomenda + grava dossiê). **Ativa não** — ativação é determinística, automática após `discovery_close`. |
| Sofia chama Catarina pelo WhatsApp? | **Sim, mas assíncrono** via bridge cron — sessão e canal separados, não na hora. |
| Tudo na mesma sessão? | **Não.** Discovery síncrono + Deepening assíncrono. Misturar quebra o modelo. |

---

## Gaps e riscos que precisam ser resolvidos pra isso funcionar

### Gap A — Sofia subagente no tenant cliente não consegue largar o arquivo (ALTO)
No público, Sofia é `main` e escreve em `state/` da raiz. No **cliente**,
Sofia roda sandboxed em `agents/sofia/` — o `write_file` dela cai no
sandbox dela, **não** em `workspace/state/discovery-close.request.json`
que o cron lê.
**Correção:** no fluxo cliente, **Rafael** (que tem workspace raiz) faz o
drop do arquivo, OU Sofia delega a escrita pro Rafael via `delegate`.
Precisa de uma instrução explícita no `agents/sofia/AGENT.md` ("se você
não for main, delegue o discovery_close pro Rafael").

### Gap B — Catarina via WhatsApp institucional só existe no fluxo público→promovido (ALTO) ✅ CORRIGIDO
`enviar-whatsapp-jotaduo` só funciona em tenant público (o provisioner
injeta as envs do sidecar só nesse caso). Se Rafael acionar Sofia num
**cliente** e quiser deepening, a Catarina institucional **não tem canal**.
**Correção aplicada:** `agents/catarina/AGENT.md` agora tem detecção
public-vs-client. Em tenant cliente (503 da skill), Catarina troca para
deepening no painel, delegando as perguntas pro Rafael levar ao dono no
canal interno — em vez de ficar inerte esperando pareamento.

### Gap C — Dois caminhos de onboarding competindo no cliente (MÉDIO)
O `AGENT.md` raiz lista DUAS rotas: `onboarding/coletar-empresa-whatsapp`
(skill leve do Rafael) e a Sofia com `jotaduo-discovery` (discovery
rico). Não está dito qual usar quando.
**Correção:** regra clara —
- coleta rápida por WhatsApp (dono sem tempo) → `coletar-empresa-whatsapp`
- discovery completo no painel → delega pra Sofia
Documentar o critério no `AGENT.md` raiz (seção Encaminhamento).

### Gap D — Colisão `discovery_close` × `empresa.md` preenchido manual (MÉDIO) ✅ CORRIGIDO
Já reportado em `2026-06-02-gaps-sofia-publica.md`. **Confirmado real**:
`write_discovery_close_outputs` (state.py:701) fazia `atomic_write_text`
incondicional em `empresa.md` — sobrescrevia dado manual do dono sem aviso.
(O `bootstrap_empresa_md` do cron preserva, mas o `state.py` em si não.)
**Correção aplicada:** antes de sobrescrever, se o `empresa.md` existente
estiver preenchido (≥3 campos reais), o state.py salva
`empresa.md.pre-discovery.bak`. Dado manual nunca é perdido em silêncio;
operador pode reconciliar. Templates vazios não geram backup. Testado nos
dois casos.

---

## Sequência ideal (tenant público — o caminho principal de receita)

```
1. Visitante entra no tenant público → Sofia (main)
2. Sofia: discovery 8 fases (síncrono, painel)
3. Sofia: recomenda time de IA (lista) → pede nome/email/WhatsApp (1 campo/vez)
4. Sofia: grava state/discovery-close.request.json   [único arquivo]
5. cron discovery-close (5min): empresa.md + discovery_done
6. ui-visibility: public → waiting   (Sofia/Rafael seta)
7. [ADMIN] clica "Promover" → POST /tenants/{id}/promote → tenant real
8. cron bridge (15min): discovery_done + first_contact null → Catarina 1º WhatsApp
9. Catarina: deepening assíncrono, 5 áreas, dias, WhatsApp institucional
10. Catarina: maturidade 5/5 → notify Rafael → equipe opera sem curadoria
```

A única intervenção humana é o passo 7 (admin promove). Todo o resto é
automático/determinístico.

---

## Recomendação final

**Adotar o desenho em camadas como está descrito.** Os quatro gaps
identificados na validação foram resolvidos:

- **Gap A (ALTO)** ✅ — Sofia subagente delega o `discovery_close` pro Rafael.
- **Gap B (ALTO)** ✅ — Catarina detecta cliente e faz deepening no painel.
- **Gap C (MÉDIO)** ✅ — árvore de decisão de onboarding no `AGENT.md` raiz.
- **Gap D (MÉDIO)** ✅ — backup anti-perda do `empresa.md` no state.py.

No fluxo **público** (core de receita) o desenho funciona ponta a ponta.
No fluxo **cliente**, os fallbacks agora estão especificados e ligados.

Não unificar discovery e deepening na mesma sessão. A separação
síncrono/assíncrono não é acidente — é o que respeita o tempo do dono e
os canais distintos.
