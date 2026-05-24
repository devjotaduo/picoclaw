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

## Postura: consultor, não checklist

Esta skill substitui o fluxo antigo de 15 passos lineares por um **diálogo
reflexivo**. Princípios não-negociáveis:

- **Fale como consultor, não vendedor.** Escute antes de propor.
- **Reflita o que ouviu antes de seguir.** "Pelo que entendi, hoje vocês..."
- **Uma pergunta por vez.** Máximo duas se forem do mesmo eixo.
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
8. **Confirmação e salvamento** → `scripts/save_client.py` + atualizar `memory/empresa.md`

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
2. Selecione 2-5 agentes do roster local (Rafael, Clara, Luna, Marcos,
   Camila, Lia, Operador, QA-Tester) que respondam às dores priorizadas.
3. Para cada agente recomendado, explique em uma frase:
   - **O que faz** (em linguagem do cliente)
   - **Qual dor resolve**
   - **Quais integrações precisa** (WhatsApp Business, Google Calendar,
     sistema externo X, etc.)
4. Se faltar integração crítica → marcar como **"a validar"**.
5. Se a dor pedir agente que não existe (ex: `agente-cobranca`,
   `agente-agendador` integrado), sinalize a **pendência de criação** e
   ofereça workaround com agentes existentes (ex: Rafael+cron pra cobrança).
6. Sugira **ordem de implantação** — quem entra primeiro e por quê.

## Salvamento (Fase 8) — duas escritas

Quando o cliente confirmar que as informações estão corretas:

### 8a. Dossiê estruturado (JSON + Markdown)

⚠️ **CRÍTICO:** o `save_client.py` auto-detecta o workspace subindo até
achar `AGENT.md + memory/`. A partir do diretório da skill, ele para no
`workspace/agents/sofia/` (workspace dela), gravando em
`workspace/agents/sofia/memory/jotaduo/clientes/` — lugar **errado**.
Os outros agentes (Rafael, Clara, etc.) precisam ler do workspace raiz.

⚠️ **DOIS bloqueios do sandbox** que você precisa contornar:

1. `exec(action="run")` NÃO tem STDIN — `data` arg só vale pra `action="write"`
2. Seu sandbox (workspace `agents/sofia/`) bloqueia exec que aponte pra
   workspace raiz. **Delegue ao Rafael** que tem workspace raiz e roda livre.

**Fluxo correto em 3 passos:**

**Passo 1 (Sofia):** grava payload temp DENTRO do teu workspace:

```
write_file(
  path="memory/jotaduo-payload.tmp.json",
  overwrite=true,
  content='{"empresa":"jotaduo","segmento":"clinica", ...JSON COMPLETO...}'
)
```

(Vai pra `agents/sofia/memory/jotaduo-payload.tmp.json` — dentro do teu sandbox.)

**Passo 2 (delegate ao Rafael):** Rafael copia o payload pra dentro do
workspace dele e roda o script com cwd=raiz:

```
delegate(
  agent_id="main",
  task="""1. Use read_file pra ler workspace/agents/sofia/memory/jotaduo-payload.tmp.json
2. Use write_file pra salvar em memory/jotaduo-payload.tmp.json (no seu workspace raiz)
3. Execute o save_client com:

exec(
  action="run",
  command="python skills/jotaduo-discovery/scripts/save_client.py --workspace . --payload-file memory/jotaduo-payload.tmp.json",
  cwd="<seu workspace raiz>"
)

4. Me devolva o stdout do comando.
"""
)
```

(Em produção tenant: workspace raiz é `/root/.picoclaw/workspace`.)

O script grava em (relativo ao `--workspace`):
- `memory/jotaduo/clientes/<slug>.json` (payload completo)
- `memory/jotaduo/clientes/<slug>.md` (dossiê legível)
- Linha em `memory/MEMORY.md` sob `## Jotaduo - Clientes`

Schema completo no final deste arquivo.

### 8b. memory/empresa.md (formato dos outros agentes)

**CRÍTICO:** o detector de onboarding (`pkg/agent/onboarding_default.go`)
monitora `workspace/memory/empresa.md`. Enquanto esse arquivo tiver
`Status: pendente de validação` OU campo `Nome:` vazio OU `Segmento:`
vazio, Sofia continua como default agent. Para liberar Rafael e os outros,
esse arquivo precisa estar preenchido.

**Sofia NÃO consegue escrever direto nesse arquivo** porque o workspace
dela é `workspace/agents/sofia/` (sandbox-restrito). Você delega ao
Rafael (`main`), que tem workspace raiz e permissão de escrita.

⚠️ **CRÍTICO sobre o path:** o Rafael TEM `workspace = workspace/` como
cwd dele. Então o path passado pra ele deve ser **`memory/empresa.md`**
(relativo ao workspace dele), **NÃO** `workspace/memory/empresa.md`.
Path errado vira `workspace/workspace/memory/empresa.md` que ninguém lê.

```
delegate(
  agent_id="main",
  task="""Use write_file com overwrite=true e path EXATAMENTE igual a
"memory/empresa.md" (sem prefixo workspace/). Conteúdo já validado
pela Sofia durante o discovery — NÃO altere nada, só grave exatamente
como está.

<COLE AQUI O MARKDOWN COMPLETO NO FORMATO ABAIXO>
"""
)
```

Formato exato a passar pro Rafael:

```markdown
# Memória da empresa

Nome: <nome do negócio>
Segmento: <chave — saude/alimentacao/varejo/servicos/beleza/educacao/imobiliaria>
Descrição: <1 frase>
Produtos ou serviços: <lista>
Horário: <faixa>
Endereço: <cidade ou "atendimento 100% online">
Regiões atendidas: <lista>
WhatsApp: <número>
Email: <contato_email do dono — CAMPO OBRIGATÓRIO pro validate>
Instagram:
Site:
Formas de pagamento: <lista>
Pode falar preço: <pode informar | só faixa | nunca>
Faixa de preço:
Quando chamar humano: <regras de escalation>
Informações que nunca podem ser inventadas: <lista>
Informações proibidas de falar:
Segmento detectado: <mesma chave do Segmento, em snake_case>

# Campos específicos do segmento — CRÍTICO pra liberação
# Preencha EXATAMENTE as chaves abaixo conforme o segmento detectado.
# O validate_workspace.py procura essas chaves específicas e bloqueia
# liberação se faltarem. NÃO mude o nome das chaves — só o valor.

# Se segmento = saude:
Canal de agendamento: <Shosp/Doctoralia/iClinic/etc + observações>
Especialidades: <lista>
Convênios aceitos: <lista OU "somente particular">

# Se segmento = alimentacao:
Cardápio: <link OU "sob demanda">
Delivery próprio: <sim/não>
Plataformas de delivery: <iFood/Rappi/etc OU "nenhuma">

# Se segmento = varejo:
Catálogo: <link OU descrição>
Política de troca: <texto>
Faz entrega: <sim/não>

# Se segmento = servicos:
Como gera orçamento: <texto>
Prazo padrão: <texto>

# Se segmento = beleza:
Canal de agendamento: <texto>
Lista de serviços: <texto>

# Se segmento = educacao:
Cursos oferecidos: <lista>
Como faz matrícula: <texto>

# Se segmento = imobiliaria:
Tipos de imóvel: <lista>
Como agenda visita: <texto>

Status da informação: validado pelo dono em <YYYY-MM-DD> (onboarding via discovery)

## Cadastro da empresa — concluído

<resumo de 5-10 bullets dos pontos principais que coletou — texto livre>

## Pendências sinalizadas pro dono resolver

<lista das integrações/decisões "a validar" — IMPORTANTE pra admin saber>
```

**Regras de ouro pro formato:**
- **NUNCA** mude o nome das chaves (`Nome:`, `Segmento:`, `Email:`,
  `Canal de agendamento:`, etc.) — o validate_workspace procura match exato
- **NÃO** coloque info do segmento como bullet no "## Cadastro" — bullets
  são pra RESUMO narrativo; campos do segmento têm que ser `chave: valor`
  no topo
- Inclua **só os campos do segmento detectado** — apague os comentários e
  blocos de outros segmentos
- Campo `Email:` é OBRIGATÓRIO (universal) — sem ele admin não consegue
  liberar

Rafael (workspace raiz) executa o `write_file` real. Sofia só formata o
payload e delega — não tenta escrever direto no raiz (o sandbox bloqueia).

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

Além do dossiê, o `save_client.py` registra automaticamente uma linha em
`memory/MEMORY.md` sob `## Jotaduo - Clientes` no formato:

```
- <empresa> (<segmento>) - dossiê em memory/jotaduo/clientes/<slug>.md - <data>
```

**Não salve dados sensíveis** (CPF, senhas, tokens, dados clínicos
detalhados). E-mail e telefone comerciais OK.

## Quando termina o discovery — 8c: GERA RELATÓRIO, NÃO LIBERA

**IMPORTANTE:** após salvar dossiê + delegar `memory/empresa.md` ao Rafael,
você roda a skill `tenant-liberation` que GERA o relatório de prontidão —
mas **NÃO libera o tenant**. A liberação real é decisão exclusiva do admin
(que vê o relatório no painel adm.jotaduo.com/tenants/discovery e faz as
integrações externas necessárias antes de liberar).

### Passo 8c — Gerar relatório (via delegate ao Rafael)

⚠️ **Sofia tem sandbox restrito** ao próprio workspace (`agents/sofia/`)
— o `exec` dela é bloqueado se o cwd ou args apontarem pro workspace raiz.
**Delegue o validate ao Rafael** (workspace=raiz, sem essa restrição):

```
delegate(
  agent_id="main",
  task="""Rode o validate de readiness do tenant e me devolva o JSON
exato (sem comentar nem reformatar). Use a tool exec assim:

exec(
  action="run",
  command="python skills/tenant-liberation/scripts/validate_workspace.py --workspace .",
  cwd="<seu workspace raiz, ex: C:/Users/ruthe/Pictures/pico2/picoclaw/workspace>"
)

O cwd deve ser EXATAMENTE o seu workspace raiz (Rafael) — sem subpasta.
O argumento --workspace é "." (ponto) pra apontar pro mesmo cwd.

Retorna pra mim só o stdout do comando (o JSON).
"""
)
```

Rafael executa e devolve o JSON via response do subturn. Você processa
o JSON: lê `missing_summary` e `integracoes_required`.

Não tente "consertar" pendências marcadas como admin-action — essas são
do operador humano, não suas.

### Passo 8d — Notificar admin

```
notify_user(
  kind="data",
  title="Discovery concluído — <empresa> aguarda liberação",
  body="<N> pendências p/ admin resolver. Veja em adm.jotaduo.com",
  agent_id="sofia",
  cta_url="/files/memory/jotaduo/clientes/<slug>.md",
  cta_label="Abrir dossiê"
)
```

### Passo 8e — Encerrar com o cliente

Mensagem padrão (curta, sem prometer prazo):

> "Já tenho tudo que precisava do nosso primeiro papo. Mandei o resumo
> pro nosso time avaliar as últimas pendências e fazer as integrações
> que faltam. Em breve liberamos o painel completo pra você."

**NÃO** prometa prazo. **NÃO** chame `set_ui_profile` — essa tool é do
backend admin, não sua. O cliente vê só o chat até o admin liberar.

## O que muda quando o admin libera

Quando admin clica "LIBERAR TENANT" no painel:
1. Backend roda `validate_workspace.py` final
2. Se `ok: true` → escreve `ui-visibility.json` com `active_profile: "tenant"`
3. Frontend re-renderiza com painel completo
4. Cliente entra → vê Rafael como default (override Sofia já desativou
   antes porque empresa.md está completo)
5. Catarina (curadora) fica disponível pra aprofundamento posterior
