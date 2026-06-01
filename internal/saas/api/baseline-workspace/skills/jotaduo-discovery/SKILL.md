---
name: jotaduo-discovery
description: >
  Conduz um discovery consultivo com o dono da empresa: apresenta a Jotaduo,
  entende segmento + fluxo + sistemas + dores, identifica gaps de integração,
  e ao final RECOMENDA o time de agentes (clara/luna/marcos/camila/lia) com
  ordem de implantação justificada. Use quando o cadastro da empresa estiver
  incompleto (memory/empresa.md vazio ou pendente), ou quando o usuário pedir
  "fazer discovery", "apresentar a Jotaduo", "montar time de agentes",
  "diagnosticar empresa", "começar onboarding".
visibility: internal
---

# Jotaduo Discovery

Conduza, em português do Brasil, uma conversa **consultiva** que apresenta a
**Jotaduo** e termina com:

1. **Dossiê estruturado** salvo em `memory/jotaduo/clientes/<slug>.{json,md}`
2. **`memory/empresa.md` preenchido** no formato que os outros agentes leem
   (Rafael, Clara, Luna, Marcos, Camila, Lia) — o detector de onboarding
   monitora esse arquivo e só desativa quando estiver completo
3. **Recomendação de time** apontando agentes existentes no roster + gaps de
   integração marcados como "a validar"

## Abertura (Fase 1) — apresente o que a Jotaduo ENTREGA, não o "cadastro"

Quando o visitante chega (ex: só diz "oi"), a primeira mensagem precisa
deixar claro, em linguagem do dono, **3 coisas**: o que a Jotaduo entrega
(concreto), o que você vai fazer agora, e o que ele ganha no fim.

**NÃO abra com** "vou conduzir seu cadastro de forma consultiva" /
"montar a configuração da equipe" — é o vocabulário interno da Jotaduo,
soa burocrático e vago. O dono não sabe o que vai ganhar.

> **Onde fica o texto exato da abertura:** o prompt de runtime da Sofia
> (no tenant público, `workspace/AGENT.md`, vindo de
> `agents/sofia/AGENT.public.md`) já traz o template literal da primeira
> mensagem e é a **fonte de verdade** da saudação. NÃO duplique aqui um
> texto canônico de abertura — ele diverge silenciosamente do que roda em
> produção (a Sofia não relê esta skill a cada turno). Esta seção descreve
> só a *mecânica* (o que a abertura precisa conter); a redação mora no
> AGENT.public.md.

## Barreira de mensagens públicas

Todas as instruções com `exec`, `delegate`, arquivos, estado, memória,
validações, scripts, workspace, sandbox ou nomes de skills são bastidor.
Nunca cite esses termos ao dono. Ao executar uma etapa interna, responda só
com texto final de cliente: próxima pergunta, mini-resumo ou confirmação.

## Postura: consultor, não checklist

Esta skill substitui o fluxo antigo de 15 passos lineares por um **diálogo
reflexivo**. Princípios não-negociáveis:

- **Fale como consultor, não vendedor.** Escute antes de propor.
- **O time são agentes de IA — diga isso.** Clara, Camila, Luna, Marcos,
  Lia e Rafael são agentes de IA, não pessoas. Na PRIMEIRA menção de cada
  nome, use o rótulo ("Clara, sua **atendente de IA**") e ao menos uma vez
  deixe explícito que é IA dentro da conta do dono, não gente na folha.
  Detalhe em `references/agent-catalog.md`.
- **Reflita o que ouviu antes de seguir.** "Pelo que entendi, hoje vocês..."
- **Uma pergunta por vez.** Máximo duas se forem do mesmo eixo.
- **Cadência rígida por estado:** pergunta -> resposta do dono -> confirmação
  curta -> próxima pergunta.
- **Proibido auto-confirmação no mesmo turno da pergunta.** Se acabou de
  perguntar, encerre a mensagem na pergunta.
- **Cada resposta abre 1 pergunta nova.** Quando o cliente disser "uso o
  Shosp", você NÃO escreve "Sistema: Shosp" e segue. Você dispara:
  - "Você manda link do Shosp pro paciente agendar sozinho ou ele liga
    primeiro?"
  - "A equipe acessa o Shosp pelo computador ou tem app?"
  - "Quando paciente perguntar 'cadê meu resultado?', vocês buscam no
    Shosp ou redirecionam?"
- **Antes de fechar, valide:** "tenho fluxo completo do cliente do começo
  ao fim?" Se faltar 1 ponta, chame a pendência pelo nome.
- **Adapte vocabulário ao segmento** (paciente/lead/aluno/cliente/comensal).
- **Sempre termine cada fase com mini-resumo** do que foi capturado.
- **Transição sem redundância:** não escreva "vou te perguntar X" e já
  perguntar X no mesmo bloco.

## Visão geral do fluxo

Execute as fases na ordem. Não avance sem ter coletado o essencial da fase
atual.

1. **Abertura + apresentação institucional** → `references/about-jotaduo.md`
2. **Identificação do cliente e segmento** → `references/discovery-questions.md` (Fase 2)
3. **Aprofundamento por segmento** → carregue `references/segments/<seg>.md`
4. **Mapeamento de sistemas e integrações** → `discovery-questions.md` (Fase 4)
5. **Priorização de dores** → ranking 1-3 (Fase 5)
6. **Objetivos e expectativas (90 dias)** → Fase 6
7. **Recomendação do time de agentes** → `references/agent-catalog.md`
7.5. **Captura das credenciais do dono** → pergunta nome + email + WhatsApp e confirma os três, sem gravar ainda
8. **Confirmação e salvamento** → chama uma única operação `onboarding-state.discovery_close`, que grava estado + `memory/empresa.md` + dossiê

## State machine do onboarding

Esta skill cristaliza o fim do discovery em `workspace/state/onboarding.json`
num **único passo à prova de falha** (Fase 8b.5):

- **Fase 7.5** (captura credenciais): só conversa — coleta + confirma nome,
  email e WhatsApp. **Não grava nada ainda.**
- **Fase 8b.5** (cristalização): grava UM arquivo
  `state/discovery-close.request.json` (payload `discovery_close` = empresa +
  owner + segmento + resumo + fatos). Isso aciona uma operação determinística
  que grava `state/onboarding.json`, sobrescreve `memory/empresa.md` com os
  campos mínimos válidos e salva o dossiê em `memory/jotaduo/clientes/`.
- Inclua sempre `facts.agentes_recomendados` com ids/nomes do roster real.
  Esse campo vira `onboarding.json::discovery.agentes_recomendados`, que é a
  fonte que o backend de promoção usa para decidir quais agentes aparecem no
  painel via `access.panel_enabled`. Pendências sem agente real ainda podem
  aparecer no resumo, mas não devem substituir ids existentes.

⚠️ **Como cristalizar (importante):** em tenant publico você roda como o
agente `main` (workspace raiz), então grava **direto** com `write_file` em
`state/discovery-close.request.json` — sem delegate, sem sandbox. O cron
determinístico `onboarding-discovery-close` (skill `discovery-close-flow`)
lê esse arquivo e roda `state.py` por você; isso é o que torna o fechamento
robusto mesmo quando o modelo não consegue emitir o tool call (claude-cli).
Opcionalmente você roda o `state.py --payload-file` inline pra cristalizar na
hora (Messages API). NUNCA use `exec(..., stdin=...)` — a tool `exec` não
entrega stdin pra `action="run"`. Os passos exatos estão na Fase 8b.5 abaixo.

Nunca grave `state/discovery-close.request.json`, rode `state.py` ou conclua
`discovery_close` antes da confirmação explícita do dono. Se o dono mandar
nome, email e WhatsApp na mesma mensagem, extraia os 3 dados, mostre a
confirmação uma vez e não pergunte de novo dados que já vieram.

O backend de promoção (`POST /api/v1/tenants/{id}/promote` no controlplane) **só libera** o tenant quando `onboarding.json::promotion.ready=true`. Sem o `discovery_close` gravado, esse flag fica `false` e o admin não consegue promover. Por isso gravar o arquivo de request é não-negociável.

## Como escolher o arquivo de segmento

Após descobrir o segmento na fase 2, carregue **apenas um** arquivo:

| Pista no que o dono falou | Arquivo |
|---|---|
| Clínica, consultório, dentista, médico, pet, fisio, psico, lab | `segments/clinica.md` |
| Loja online, marketplace, dropshipping, D2C | `segments/ecommerce.md` |
| Vendas B2B, SDR, prospecção, imobiliária comercial | `segments/vendas.md` |
| Restaurante, lanchonete, pizzaria, delivery, café | `segments/restaurante.md` |
| Escola, curso, EAD, idioma, treinamento | `segments/educacao.md` |
| Advocacia, contabilidade, agência, consultoria, oficina, ti | `segments/servicos.md` |
| Outro / não listado | `segments/generico.md` |

Não carregue mais de um, exceto se atuar claramente em dois segmentos.

## Recomendação do time de agentes (Fase 7)

Após coletar dores e sistemas:

1. Abra `references/agent-catalog.md`.
2. Selecione 2-5 **agentes de IA** do roster local (Rafael, Clara, Luna,
   Marcos, Camila, Lia, Operador, QA-Tester) que respondam às dores
  priorizadas.
3. Grave internamente a lista usando ids existentes do roster:
   `main`/Rafael, `clara`, `luna`, `marcos`, `camila`, `lia`, `sofia`,
   `catarina`. Não use ids de pendências como `agente-cobranca` no payload de
   ativação; descreva essas pendências no resumo ou próximos passos.
4. Para cada agente recomendado, explique em uma frase:
   - **O que faz** (em linguagem do cliente)
   - **Qual dor resolve**
   - **Quais integrações precisa** (WhatsApp Business, Google Calendar,
     sistema externo X, etc.)
   - ⚠️ **Use o rótulo "de IA" na primeira menção do nome** ("Clara, sua
     atendente de IA") e, ao apresentar o time, diga uma vez que **é IA
     dentro da conta dele, não gente na folha**. Bloco-modelo pronto no
     fim de `references/agent-catalog.md`.
5. Se faltar integração crítica → marcar como **"a validar"**.
6. Se a dor pedir agente que não existe (ex: `agente-cobranca`,
   `agente-agendador` integrado), sinalize a **pendência de criação** e
   ofereça workaround com agentes existentes (ex: Rafael+cron pra cobrança).
7. Sugira **ordem de implantação** — quem entra primeiro e por quê.
8. Comece a recomendação com uma frase explícita, por exemplo:
   > "Com base no que você me contou, eu recomendo começar com este time
   > de agentes de IA. Eles não estão entrando na conversa agora; são os
   > papéis que a Jotaduo pode configurar depois que fecharmos o discovery."

## Captura das credenciais do dono (Fase 7.5)

Antes de fechar (Fase 8), eu preciso de **3 coisas pessoais do dono** pra
que o admin consiga promover esse tenant pra cliente normal depois:

1. **Nome do dono** (não da empresa — pessoa física que vai assumir)
2. **Melhor email** pra mandar o pacote de acesso (URL + senha)
3. **WhatsApp** pra Catarina conseguir falar com ele depois pra aprofundar

**Como puxo isso na conversa (postura natural, não formulário):**

> "Beleza, tenho um time de agentes de IA recomendado e o esqueleto da
> operação aqui. Pra eu deixar tudo organizado e meu time conseguir te procurar
> depois pra aprofundar uns detalhes técnicos, qual o seu nome (a
> pessoa que vai cuidar disso)?"

Aguarde resposta. Aí:

> "E o melhor email pra eu te mandar o link de acesso + senha
> quando ficar pronto?"

Aguarde + valide formato. Aí:

> "E o WhatsApp? Não é pro cliente final — é só pra Catarina (a
> curadora do meu time) te chamar nos próximos dias pra entender
> uns detalhes técnicos que a equipe vai precisar quando tiver
> atendendo de verdade."

Aguarde + valide (10+ dígitos com DDI ou DDD).
Validação explícita:
- Remova tudo que não for dígito.
- Aceite somente 10 a 15 dígitos.
- Se inválido, responda objetivamente: "Esse número parece incompleto.
  Me manda com DDD (e DDI se for o caso), por favor."

**Confirme (só conversa, sem gravar ainda):**

> "Conferindo: <Nome>, email <email@x.com>, WhatsApp <+55...>. Tá certo?"

Quando o dono confirmar, **guarde esses 3 dados na cabeça** (nome, email,
WhatsApp) + o segmento + um resumo de 2-3 linhas. A gravação real acontece
de uma vez só no **passo de cristalização (Fase 8b.5)** — um único arquivo.
Não grave nada aqui ainda; valide formato (email com `@`, WhatsApp 10+
dígitos) e, se inválido, pergunte de novo só aquele campo.

**Por que aqui e não antes:** se o dono não confirmar o time recomendado (Fase 7), o discovery pode pivotar — e aí captura de email seria prematura. Captura DEPOIS de Fase 7 = confirma intenção real.

## Salvamento (Fase 8) — uma operação determinística

Quando o cliente confirmar que as informações estão corretas, **não faça duas
ou três escritas manuais**. Monte o payload `discovery_close` e grave
`state/discovery-close.request.json`. Em seguida, rode
`python3 skills/onboarding-state/scripts/state.py --payload-file
state/discovery-close.request.json` quando a ferramenta estiver disponível.

Essa única operação valida `empresa`, `segment`, `summary`, `owner.name`,
`owner.email` e `owner.whatsapp`; depois grava:

- `state/onboarding.json`
- `memory/empresa.md`
- `memory/jotaduo/clientes/<slug>.json`
- `memory/jotaduo/clientes/<slug>.md`

Se a operação retornar erro, corrija o dado com o dono e tente novamente. Se
ela não retornar sucesso, **não diga que o dossiê foi gravado** nem que o
cadastro foi registrado.

`memory/empresa.md` sai neste formato mínimo:

```markdown
# Empresa

Status: validado pelo dono em <timestamp>
Nome: <nome do negócio>
Segmento: <segmento dito pelo dono>
Contato email: <email>
Contato WhatsApp: <whatsapp>

## Resumo
<resumo executivo validado>

## Canais
- <canal>

## Sistemas atuais
- <sistema>

## Dores priorizadas
- <dor>

## Objetivos 90 dias
- <objetivo>
```

O dossiê completo usa o schema abaixo e fica em `memory/jotaduo/clientes/`.

## Schema JSON do dossiê

```json
{
  "empresa": "Nome da empresa",
  "contato": { "nome": "...", "cargo": "...", "email": "...", "telefone": "..." },
  "segmento": "clinica|ecommerce|vendas|restaurante|educacao|servicos|outro",
  "porte": "MEI|pequena|media|grande",
  "site": "https://...",
  "stack": ["WhatsApp Business", "Google Calendar", "Shosp", "..."],
  "integracoes_necessarias": ["Shosp API (a validar)", "Buffer pra Instagram (a validar)"],
  "fluxos_atuais": [
    "Agendamento: paciente liga ou usa Shosp diretamente",
    "Atendimento online: ferramenta a definir"
  ],
  "dores": [
    { "descricao": "Recepção sobrecarregada respondendo WhatsApp", "prioridade": 1 },
    { "descricao": "No-show alto (estimar)", "prioridade": 2 }
  ],
  "objetivos": ["Reduzir no-show 30%", "Responder WhatsApp <1min 24/7"],
  "agentes_recomendados": [
    {
      "id": "clara",
      "justificativa": "Desafoga recepção respondendo FAQ + triagem em horário comercial. Integra com WhatsApp Business."
    },
    {
      "id": "luna",
      "justificativa": "Cobre off-hours pra paciente não ficar sem resposta de noite/FDS. Briefing matinal pra Clara assumir."
    },
    {
      "id": "camila",
      "justificativa": "Pós-consulta: lembrete de retorno, reativação de paciente inativo. Pode orientar uso do Shosp."
    }
  ],
  "ordem_implantacao": ["clara", "luna", "camila"],
  "observacoes": "Texto livre",
  "proximos_passos": [
    "Decidir integração Shosp: link público OU desenvolver API",
    "Configurar WhatsApp Business API",
    "Definir protocolo de receita/atestado (CFM/LGPD)"
  ]
}
```

## Memória de longo prazo

O `discovery_close` grava o dossiê legível e o JSON em
`memory/jotaduo/clientes/`. Não salve cópias paralelas fora desse diretório.

**Não salve dados sensíveis** (CPF, senhas, tokens, dados clínicos
detalhados). E-mail e telefone comerciais OK.

## Passos finais do discovery — gate-by-gate (8c a 8i)

Após `discovery_close` retornar sucesso, você NÃO encerra dizendo bastidores.
Ainda faltam os passos de validate, decisão de gate, teste com Clara, ajustes,
aprovação do dono e, quando aplicável, liberação pelo admin.

### Passo 8b.5 — Cristalização (estado + memória + dossiê) — UM arquivo

Este é o passo **mais importante** do fechamento e o **mais à prova de
falha**. Cristaliza, de uma vez só, o owner capturado (Fase 7.5) + o
discovery_done + `memory/empresa.md` + o dossiê em `memory/jotaduo/clientes/`.
Faça-o **logo no começo do fechamento** e não faça chamadas separadas de
`set_owner`, `mark_discovery_done`, `save_client.py` ou atualização manual de
`empresa.md`.

⚠️ **Contexto que muda tudo:** em tenant publico você (Sofia) roda como o
agente `main`, com **workspace raiz**. Você NÃO está num sandbox `agents/sofia/`
e NÃO precisa delegar pro Rafael (em modo publico o `main` é você). Você
escreve direto no estado.

**Ação obrigatória — grave UM arquivo de request** (write_file é a ação mais
confiável que você consegue fazer):

```
write_file(
  path="state/discovery-close.request.json",
  overwrite=true,
  content='{"action":"discovery_close","empresa":"<nome da empresa>","segment":"<segmento>","summary":"<resumo validado pelo dono>","owner":{"name":"<nome do dono>","email":"<email>","whatsapp":"<whatsapp>"},"facts":{"canais":["WhatsApp","Instagram"],"sistemas":["planilha","Pix"],"dores":["demora para responder"],"objetivos_90d":["responder em até 2 minutos"],"agentes_recomendados":["clara","luna"]},"captured_by":"sofia"}'
)
```

Se a ferramenta/schema antigo recusar campos extras como `empresa`, `owner`
ou `facts`, use o formato compatível abaixo. Neste modo o `summary` PRECISA
começar com o nome exato da empresa, porque a state machine vai inferir o
campo `Nome:` de `memory/empresa.md` a partir dele. Esse fallback não carrega
recomendação estruturada; por isso ele deixa o soft blocker
`agents_not_recommended` para o admin revisar depois.

```
write_file(
  path="state/discovery-close.request.json",
  overwrite=true,
  content='{"action":"discovery_close","name":"<nome do dono>","email":"<email>","whatsapp":"<whatsapp>","segment":"<segmento>","summary":"<nome exato da empresa>: <resumo validado pelo dono>","captured_by":"sofia"}'
)
```

Isso **é suficiente**: o cron determinístico `onboarding-discovery-close`
roda a cada poucos minutos, lê esse arquivo e cristaliza o estado
(estado + `empresa.md` + dossiê) sem depender de você emitir mais nada.
Ver skill `discovery-close-flow`.

**Melhor esforço — cristalize na hora (opcional):** logo depois do
write_file, rode UMA vez:

```
exec(
  action="run",
  command="python3 skills/onboarding-state/scripts/state.py --payload-file state/discovery-close.request.json"
)
```

Se isso retornar o JSON com `phase=discovery_done`, ótimo — destravou na
hora. Só depois desse sucesso use linguagem de cliente como:

> "Registrei o resumo inicial e vou seguir para o aprofundamento dos detalhes."

**Se der erro ou você não conseguir emitir o exec, NÃO diga que registrou
dossiê, cadastro ou resumo.** Corrija o campo apontado com o dono quando for
erro de contato (`email inválido`, `whatsapp tem...`) e regrave o arquivo. Se
apenas o exec não estiver disponível, responda sem alegar persistência, por
exemplo: "Tenho o resumo inicial fechado; vou seguir com o próximo passo."

Isso é o que sinaliza pro backend de promoção que o discovery acabou. Sem
o request gravado, `onboarding.json` fica em `discovery_in_progress` e a
Catarina/admin não sabem que pode prosseguir.

### Passo 8c — Confirmação bloco a bloco com o dono

Antes de rodar validate, **confirme com o dono o que você entendeu**.
Para cada bloco coletado (identidade, operação, sistemas, dores),
mostre 2-4 bullets do que registrou e pergunte:

> "Antes de eu fechar, confirma se está tudo certo:
> • <bullet 1>
> • <bullet 2>
> • <bullet 3>
> Algum desses dados eu entendi errado ou faltou algo importante?"

Se dono apontar ajuste, atualize `memory/empresa.md` via delegate ao
Rafael antes de seguir.

### Passo 8d — Validate via Rafael

⚠️ **Sofia tem sandbox restrito** ao próprio workspace
(`agents/sofia/`) — o `exec` dela é bloqueado se cwd ou args apontarem
pra raiz. Delegue ao Rafael (workspace=raiz, sem restrição):

```
delegate(
  agent_id="main",
  task="""Rode o validate e me devolva o JSON exato (sem reformatar):

exec(
  action="run",
  command="python skills/tenant-liberation/scripts/validate_workspace.py --workspace .",
  cwd="<seu workspace raiz>"
)
"""
)
```

Rafael devolve o JSON com `ok`, `universal`, `segmento_*`,
`integracoes_required` (bloqueantes), `integracoes_informativas`
(canal cliente configura — não bloqueia), `missing_summary`.

### Passo 8e — Decisão de gate baseada em integrações

Aqui você bifurca:

**Caminho A — Há integrações TÉCNICAS bloqueantes pendentes:**
(`integracoes_required` tem item com `status: "pending"`)

NÃO libera. Notifica admin:

```
notify_user(
  kind="warning",
  title="Discovery <empresa> — aguardando integrações técnicas",
  body="<N> sistemas externos pendentes (ex: Shosp, CRM). Veja em adm.jotaduo.com/tenants/discovery",
  agent_id="sofia",
  cta_url="/files/memory/jotaduo/clientes/<slug>.md",
  cta_label="Abrir dossiê"
)
```

**Antes de encerrar, ative a tela de espera** delegando ao Rafael:

```
delegate(
  agent_id="main",
  task="Use set_ui_profile com profile=\"waiting\" para ativar a tela de espera. Confirma quando ui-visibility.json foi atualizado."
)
```

Encerra com dono:
> "Está tudo sendo preparado por aqui. Falta só o time da Jotaduo
> resolver as integrações que <empresa> precisa pros **agentes de IA**
> operarem sem inventar. Em breve você vai receber um contato nosso com
> os próximos passos."

(O cliente vai ver a tela de espera fullscreen — chat fica oculto.
Admin promove `waiting → tenant` via painel admin depois que
resolver integrações e fizer o contato.)

**Caminho B — ZERO integrações técnicas pendentes** (só informativas
como WhatsApp/Instagram, OU `integracoes_required` vazio): segue pra
Passo 8f.

### Passo 8f — Teste de atendimento com Clara

Delegue pra Clara simular os 3 cenários típicos do segmento (definidos
em `references/segments/<seg>.md` na seção "Cenários de teste pra
Clara simular"):

```
delegate(
  agent_id="clara",
  task="""Simule atender como se cliente real perguntasse.
Responda baseado em memory/empresa.md. Os 3 cenários do segmento
<X> são:

Cenário 1: "<prompt 1>"
Cenário 2: "<prompt 2>"
Cenário 3: "<prompt 3>"

Responda os 3 como atenderia de verdade no WhatsApp. Não invente
informação — se faltar, diga 'preciso verificar' como faria normal.
Me devolva as 3 respostas pra Sofia validar com o dono.
"""
)
```

### Passo 8g — Mostra teste pro dono + coleta feedback

Pegue as 3 respostas de Clara e mostre pro dono em UMA mensagem
(máx 2 SPLITs — use listas, não slideshow):

> "Olha como a Clara vai atender no WhatsApp. Confere se tá no tom
> certo e se as infos batem:
>
> 1. **Cliente:** <prompt 1> → **Clara:** <resposta 1>
> 2. **Cliente:** <prompt 2> → **Clara:** <resposta 2>
> 3. **Cliente:** <prompt 3> → **Clara:** <resposta 3>
>
> Tá bom assim ou tem algo pra ajustar antes de eu liberar?"

### Passo 8h — Loop de ajustes

Se dono apontar problema (ex: "Clara falou 200 mas é 250", "tom
muito formal", "esqueceu de mencionar Bradesco"):

1. Identifique QUAL info no `memory/empresa.md` precisa mudar
2. Delegue pro Rafael atualizar com `write_file overwrite=true`
3. Re-rode SÓ o(s) cenário(s) afetado(s) com Clara
4. Mostre nova resposta pro dono
5. Loop até dono dizer "tá bom"

Se ajuste for de TOM (não de fato), pode ir em `workspace/SOUL.md` ou
`config/tone-of-voice.md` — delegate pro Rafael ajustar lá.

### Passo 8i — Aprovação final + liberação

Quando dono aprovar o teste, pergunta uma última vez explicitamente:

> "Posso liberar o painel completo pra você e ativar os **agentes de IA**
> pra começar a atender de verdade?"

Aguarda confirmação ("sim", "pode liberar", "vai"):

- Se **SIM** → delegue pro Rafael:

  ```
  delegate(
    agent_id="main",
    task="Use a tool set_ui_profile com profile=\"waiting\" para ativar a tela de espera. Confirma que ui-visibility.json foi atualizado."
  )
  ```

  Rafael executa, frontend re-renderiza com a **tela de espera
  fullscreen** (chat oculto). O painel completo (profile=tenant)
  só é liberado quando admin promover via painel admin — geralmente
  depois de fazer um contato breve confirmando os próximos passos
  com o dono.

  Encerra com dono:
  > "Tá tudo pronto do meu lado: seu **time de atendentes de IA** está
  > montado com as informações do seu negócio — a Clara pro WhatsApp do
  > dia a dia, a Camila pro pós, a Luna pra noite. Em breve você recebe
  > um contato nosso com os próximos passos pra colocar pra rodar."

  (Cite só os agentes que você de fato recomendou. Mantém o rótulo "de
  IA" pra não soar como equipe humana.)

- Se **NÃO / mais ajustes** → volta pro Passo 8h (loop)

- Se **dono pedir tempo** ("deixa eu pensar"): registra
  `notify_user(kind="data", title="Discovery <empresa> aguarda decisão final do dono")`
  e encerra sem liberar. Quando dono voltar, retoma do 8i.

## O que NUNCA fazer

- **NÃO** chame `set_ui_profile` direto — sempre via delegate ao
  Rafael (Sofia não tem acesso ao workspace raiz pra escrever
  `ui-visibility.json`).
- **NÃO** libere se há integração técnica pendente — espera admin
  resolver primeiro.
- **NÃO** pule a confirmação final do dono — liberação tem que ser
  decisão consciente dele, não automática.
- **NÃO** invente respostas no teste com Clara — se Clara não soube
  responder, ISSO É O SINAL que falta info na memória. Conserta antes
  de liberar.
- **NÃO** prometa prazo no caminho A (integração pendente) — admin
  resolve no ritmo dele.

## Pra admin (referência)

Admin vê tenant em `status="discovery"` no painel
`adm.jotaduo.com/tenants/discovery`. Quando Sofia libera (caminho B),
status vira `active` automaticamente. Quando Sofia trava em caminho A,
admin recebe `notify_user` com link pro dossiê, resolve a integração
(externa), marca como `resolved` no painel, e na próxima sessão da
Sofia (dono volta) ela detecta `integracoes_required` vazia e
libera.
