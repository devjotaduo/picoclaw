---
name: aprofundar-empresa
description: >
  Conduz aprofundamento estruturado do conhecimento da empresa por área
  temática. Curadoria pós-discovery: usada pela Catarina depois que a
  Sofia liberou o tenant. Sessões curtas (10-15 min), uma área por vez,
  com gravação dual (memória local + delegate pro Rafael atualizar
  memory/empresa.md). Use quando o dono pedir "aprofundar empresa",
  "registrar mais detalhes do negócio", "curadoria de conhecimento",
  "completar memória", "Catarina, vamos detalhar X".
visibility: internal
---

# Aprofundar Empresa

Esta skill é da **Catarina** (curadora). Use **depois** que a Sofia
concluiu o discovery básico — quer dizer, `memory/empresa.md` já existe
com `Status: validado pelo dono em <data>` e o dossiê da empresa já está
salvo em `memory/jotaduo/clientes/<slug>.md`.

O objetivo aqui **não é** reabrir o discovery. É **aprofundar** o que a
Sofia capturou em alto nível, transformando em conhecimento operacional
que a equipe de atendimento (Clara, Marcos, Camila, Lia) precisa pra
não inventar respostas.

## Quando usar

- Tenant já foi liberado pela Sofia (`memory/empresa.md` completo).
- O dono chama a Catarina pedindo pra "detalhar X", "aprofundar Y",
  "registrar mais informações" — ou a Catarina foi acionada
  proativamente pelo Rafael porque a equipe está esbarrando em
  perguntas que a memória não responde.
- **Não usar** se `memory/empresa.md` estiver vazio ou marcado como
  pendente. Nesse caso, encaminha pra Sofia rodar `jotaduo-discovery`
  antes.

## Pré-requisitos: carregar contexto

Antes de começar qualquer sessão, leia o dossiê da Sofia:

```
read_file(path="memory/jotaduo/clientes/<slug>.md")
```

Catarina vive em `workspace/agents/catarina/`, então o path precisa ser
**absoluto** ou ela precisa pedir o conteúdo pro Rafael via `delegate`:

```
delegate(
  agent_id="main",
  task="Me devolve o conteúdo de memory/jotaduo/clientes/<slug>.md
        (o dossiê da Sofia). Preciso pra orientar a próxima sessão
        de aprofundamento."
)
```

Sem o dossiê, **não comece**. Avise o dono: "Não achei o dossiê inicial
da Sofia — confirma comigo se o cadastro básico foi concluído antes da
gente seguir."

## As 5 áreas universais de aprofundamento

Cada sessão cobre **uma** área. Não tente cobrir duas no mesmo turno.

| # | Chave         | O que captura                                          | Playbook                          |
|---|---------------|--------------------------------------------------------|-----------------------------------|
| 1 | equipe        | Equipe — quem faz o quê, horários individuais, áreas   | `references/area-profissionais.md` |
| 2 | casos-excecao | Casos que sempre quebram processo                      | `references/area-casos-excecao.md` |
| 3 | faq           | Perguntas reais recentes que pegaram a equipe          | template genérico (abaixo)        |
| 4 | historico     | O que já deu errado, como resolveram, lição aprendida  | template genérico                 |
| 5 | regras-tacitas| Políticas não escritas que todo mundo na empresa sabe  | template genérico                 |

Pra carregar o playbook, faça:

```
read_file(path="references/area-<chave>.md")  // relativo à skill
```

Se o arquivo não existir, use o **template genérico** abaixo.

## Template genérico (quando não há playbook específico)

Sempre que entrar em uma área sem playbook:

1. **Abra a sessão lembrando o objetivo da área.** Uma frase, sem
   ladainha. Ex: "Hoje quero entender a equipe — quem faz o quê e em
   que horário."
2. **Pergunta inicial aberta.** Deixa o dono falar sem direcionar
   demais. Ex: "Me conta como o time se divide hoje."
3. **Aprofunda em cima do que ele falou.** Cada resposta abre 1
   pergunta nova. Não pula pra próxima até esgotar o ponto atual.
4. **Marca lacunas em voz alta.** "Você não mencionou X — é porque não
   se aplica, ou só passou batido?"
5. **Antes de gravar, valida.** "Vou registrar assim: <resumo curto>.
   Posso?" Espera o "sim".

## Output: gravação dual

Toda sessão concluída gera **duas escritas**:

### Escrita 1 — Memória local da Catarina (rascunho de curadoria)

```
write_file(
  path="memory/<chave>.md",          // relativo ao workspace da Catarina
  overwrite=true,
  content="<conteúdo estruturado da sessão>"
)
```

Formato sugerido:

```markdown
# Área: <nome legível>

Última atualização: <YYYY-MM-DD>
Validado pelo dono: sim
Sessão conduzida por: Catarina

## <Subtópico 1>

<conteúdo>

## <Subtópico 2>

<conteúdo>

## Pendências / a confirmar

- <ponto que ficou aberto>
```

### Escrita 2 — Delegação pro Rafael (memória da empresa, uso diário)

Pega o **resumo de 3 a 5 bullets** da sessão e delega pro Rafael
incrementar `memory/empresa.md`. Não passa o conteúdo completo — só o
que a equipe de atendimento precisa pra atender sem inventar.

```
delegate(
  agent_id="main",
  task="""Adicione a seção abaixo no fim de memory/empresa.md
(use append_file ou edit_file, NÃO sobrescreva o arquivo inteiro).
Path EXATO: memory/empresa.md (relativo ao workspace raiz).

## <Nome da área> — aprofundado por Catarina em <data>

- <bullet 1 — info operacional crítica pra equipe>
- <bullet 2>
- <bullet 3>
"""
)
```

## State machine — sinalizar progresso pra a promoção

**Após cada área fechar** (`memory/<chave>.md` gravado + validado), chame
a skill `onboarding-state` pra registrar que a área foi coberta — em 2
passos, igual ao empresa.md.

⚠️ **NUNCA** use `exec(..., stdin=...)`: a tool `exec` não entrega stdin pra
`action="run"` (o arg só vale pra `action="write"` em sessão background) e
teu sandbox bloqueia exec apontando pra raiz. Grava o payload no teu
workspace e delega ao Rafael, que roda com `--payload-file`:

**Passo 1 (Catarina):** grava o payload no teu sandbox:

```
write_file(
  path="memory/onboarding-area.tmp.json",
  overwrite=true,
  content='{"action":"mark_area_complete","area":"<chave>"}'
)
```

**Passo 2 (delegate ao Rafael):**

```
delegate(
  agent_id="main",
  task="""Rode e me devolva o stdout EXATO:

exec(
  action="run",
  command="python skills/onboarding-state/scripts/state.py --payload-file agents/catarina/memory/onboarding-area.tmp.json",
  cwd="<seu workspace raiz>"
)
"""
)
```

Onde `<chave>` é uma de: `equipe | casos-excecao | faq | historico | regras-tacitas`.

O script é idempotente (chamar 2x pra mesma área não conta duplo). E
quando você fechar a 5ª área, o próprio script vira `promotion.ready=true`
no `onboarding.json` — o admin vê isso no painel e libera "Promover" pra
você passar de tenant publico pra cliente normal.

## Critério de maturidade (80%)

Após cada sessão, conte quantas das 5 áreas têm `memory/<chave>.md`
gravada e validada. Quando chegar a **4 de 5** (80%), encerre a
curadoria ativa com `notify_user`:

```
notify_user(
  kind="data",
  title="Curadoria concluída — Rafael assume",
  body="Empresa mapeada nas áreas: <lista>. Equipe pronta pra operar.",
  agent_id="catarina",
  cta_url="/files/memory/empresa.md",
  cta_label="Abrir memória da empresa"
)
```

**Importante:** mesmo encerrando ativa em 4/5, **só ative
`promotion.ready=true`** quando fechar a 5ª. Os 80% é pra você reduzir
pressão na curadoria, não pra o admin promover sem deepening completo.
Se o dono explicitamente recusar a 5ª área ("não precisa, é simples"),
use o escape hatch — mesmo padrão 2-passos (NUNCA `stdin=`):

```
write_file(
  path="memory/onboarding-area.tmp.json",
  overwrite=true,
  content='{"action":"mark_ready_for_promotion","reason":"dono recusou aprofundamento — empresa simples"}'
)
```

```
delegate(
  agent_id="main",
  task="""Rode e me devolva o stdout EXATO:

exec(
  action="run",
  command="python skills/onboarding-state/scripts/state.py --payload-file agents/catarina/memory/onboarding-area.tmp.json",
  cwd="<seu workspace raiz>"
)
"""
)
```

Isso força `promotion.ready=true` mas grava o motivo no JSON pra auditoria.

## Sessões curtas — não esticar

10 a 15 minutos por sessão. Se a conversa passar de 15 min, ofereça
pausa explícita: "Já é bastante coisa pra um turno. Quer parar aqui e
a gente continua amanhã?" Curadoria boa é a que o dono consegue manter
sem cansar.

## Não invente

Pergunta sem resposta vira **pendência marcada**, não suposição. Grave
em `## Pendências / a confirmar` da memória local e siga.

## O que NÃO fazer aqui

- Não reabra o discovery da Sofia (segmento, sistemas, dores básicas).
  Se notar que o dossiê dela está errado, sinalize pro dono e sugira
  chamar a Sofia de volta.
- Não fale com cliente final em nenhuma hipótese.
- Não sobrescreva `memory/empresa.md` direto — sempre via delegate pro
  Rafael.
- Não cubra 2 áreas no mesmo turno.
- Não use emoji.
