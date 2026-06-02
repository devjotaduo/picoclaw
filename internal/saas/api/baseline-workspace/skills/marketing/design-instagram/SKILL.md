---
name: design-instagram
description: Guia completo de design e copywriting para posts do Instagram — composição visual, prompt engineering, hooks, fórmulas de copy, estrutura de carrossel e stories, safe zones da UI e checklist de qualidade
triggers:
  - "criar post instagram"
  - "post para instagram"
  - "legenda instagram"
  - "arte instagram"
  - "carrossel instagram"
  - "story instagram"
  - "feed instagram"
  - "reel instagram"
depends_on:
  - marketing/design-visual
  - consultar-memoria
used_by:
  - marketing/criar-post-instagram
  - marketing/gerar-imagem-post
---

# Skill: Design Instagram

Referência interna consultada por `criar-post-instagram` e `gerar-imagem-post`
**antes de gerar qualquer conteúdo**. Cobre copy, composição visual, prompt engineering e qualidade.

---

## 1. Processo antes de criar qualquer post

1. Identificar o **tipo de post** (Seção 2).
2. Identificar o **formato** (feed, story, reel, carrossel) — cada um tem copy e visual distintos.
3. Consultar `memory/marca.md` para cores, tipografia e elementos obrigatórios/proibidos.
4. Consultar `memory/empresa.md` para segmento e público.
5. Escolher a **fórmula de copy** correspondente ao tipo (Seção 3).
6. Escolher o **gancho** da biblioteca (Seção 4).
7. Montar o **prompt de imagem** com o template do tipo (Seção 5).
8. Aplicar as **safe zones** antes de posicionar textos (Seção 6).
9. Passar pelo **checklist de qualidade** (Seção 7).

---

## 2. Tipos de post e quando usar cada um

| Tipo | Objetivo | Gatilho | Formato ideal |
|---|---|---|---|
| **Promocional** | Vender / converter agora | Desconto, lançamento, estoque limitado | Feed ou story com countdown |
| **Educativo** | Construir autoridade | FAQ recorrente, dúvida comum do público | Carrossel ou reel |
| **Relacional** | Humanizar a marca | Bastidor, conquista, depoimento | Feed ou story |
| **Produto/Serviço** | Apresentar oferta | Produto novo, serviço pouco conhecido | Carrossel ou feed único |
| **Sazonal** | Relevância na data | Feriado, data comemorativa, evento do setor | Feed ou story curto |
| **Engajamento** | Aumentar interação | Pergunta, enquete, "me conta nos comentários" | Story com enquete ou feed com pergunta |

---

## 3. Fórmulas de copy por tipo

### 3.1 Promocional — FOMO + Benefício + CTA urgente
```
[GANCHO] frase que cria urgência ou escassez
[BENEFÍCIO] o que a pessoa GANHA (não o que o produto É)
[PROVA] número, depoimento curto ou resultado concreto (se disponível)
[OFERTA] o que, quanto, quando acaba
[CTA] ação específica: "Clique no link da bio" / "Mande uma mensagem agora"
[HASHTAGS]
```
Limite ideal: 150 a 400 caracteres. Acima de 125 chars o texto é truncado no feed — o gancho DEVE estar nos primeiros 125.

### 3.2 Educativo — PAS (Problema → Agitação → Solução)
```
[GANCHO] nomear o problema que o público sente
[AGITAÇÃO] mostrar o custo de não resolver (1-2 linhas)
[SOLUÇÃO] apresentar o caminho sem vender diretamente
[CTA] "Salve este post" / "Mande para alguém que precisa"
[HASHTAGS]
```
Limite ideal: 800 a 2.200 caracteres. Educativo pode ser longo — longo sinaliza profundidade.
Carrossel educativo: cada slide = 1 ideia. Máx 80 palavras por slide.

### 3.3 Relacional — Before/After/Bridge (B/A/B)
```
[GANCHO] "Antes de [data/evento], eu/nós..."
[BRIDGE] a transformação ou conquista
[CONVITE] "Me conta: você já passou por isso?"
[CTA] comentar, compartilhar, salvar
[HASHTAGS]
```
Tom: primeira pessoa, honesto, sem exagero. Sem claim de resultado que não se pode comprovar.

### 3.4 Produto / Serviço — FAB (Feature → Advantage → Benefit)
```
[GANCHO] nome do produto/serviço + âncora de dor
[FEATURE] o que ele tem (concreto, específico)
[ADVANTAGE] o que isso permite fazer
[BENEFIT] como a vida do cliente melhora
[CTA] "Saiba mais no link da bio" / "Agende pelo WhatsApp"
[HASHTAGS]
```

### 3.5 Sazonal — Gancho de data + Conexão com oferta
```
[GANCHO] nomear a data de forma não óbvia (evitar "Feliz Dia das Mães")
[CONEXÃO] como a data se relaciona com o segmento da empresa
[MENSAGEM] celebração ou reflexão genuína (máx 3 linhas)
[CTA] suave ou ausente — post sazonal não converte, constrói marca
[HASHTAGS] incluir hashtag da data
```

### 3.6 Engajamento — Pergunta + Convite
```
[GANCHO] afirmação polarizadora ou pergunta direta
[CONTEXTO] 1-2 linhas sobre o tema
[PERGUNTA FINAL] específica, fácil de responder (não: "o que você acha?" — sim: "Qual desses você escolhe?")
[HASHTAGS] poucos — 3 a 5
```

---

## 4. Biblioteca de ganchos (hooks)

Estes ganchos são **andaime, não roteiro**. Preencher o template literalmente
("5 motivos pelos quais...") é o que faz post de agência soar igual a todo
mundo. Mecanismo obrigatório de frescor:

1. **Não reutilizar gancho recente.** Antes de escolher, olhe os últimos posts
   em `memory/marketing.md` (ou `memory/posts-publicados.md`). Se um molde já
   foi usado nos **últimos 5 posts** ou no post imediatamente anterior, escolha
   outra categoria. A regra "nunca repetir o mesmo gancho em 2 posts
   consecutivos" (§11) é o piso, não o teto.
2. **Reescrever, não preencher.** Pegue a *estrutura* do gancho e escreva uma
   frase nova com o vocabulário real da marca (`memory/marca.md` → frases
   preferidas/evitadas) e uma dor concreta do público (`memory/empresa.md`). Se
   a frase final ainda contém o esqueleto visível do template ("X motivos",
   "Poucos sabem que"), reescreva.
3. **Teste do "qualquer empresa".** Se o gancho serviria igual pra uma empresa
   de outro segmento, ele está genérico demais — ancore num detalhe que só essa
   empresa tem.

Usar como base e adaptar para o segmento e tom da empresa. Nunca copiar literalmente.

### Curiosidade
- "Poucos sabem que [fato surpreendente sobre o segmento]."
- "O maior erro de [público-alvo] é [ação comum]."
- "Isso muda tudo para quem [situação do cliente]."

### Problema
- "Se você [sintoma do problema], leia isso."
- "Pare de [ação ineficaz] e comece a [ação correta]."
- "[Número] sinais de que você precisa de [solução]."

### Número / Lista
- "[N] motivos pelos quais [resultado desejado]."
- "Em [tempo], você pode [resultado concreto]."
- "[N] perguntas que você deveria fazer antes de [ação]."

### Contraste / Choque
- "A maioria faz [X]. Os melhores fazem [Y]."
- "Não é sobre [crença comum]. É sobre [verdade]."
- "Isso parece [coisa ruim], mas é exatamente o que [resultado positivo]."

### Pergunta direta
- "Você já se perguntou por que [situação frustrante]?"
- "Quando foi a última vez que [experiência positiva]?"
- "[Pergunta que o público faz mas não fala em voz alta]?"

---

## 5. Prompt engineering para `gerar-imagem-post`

### 5.1 Template base de prompt

```
[ESTILO VISUAL] {fotografico | ilustrativo | tipografico | mockup | flat}
[SEGMENTO] {saude | beleza | varejo | alimentacao | tech | educacao | servicos}
[FORMATO] {feed 1:1 | story 9:16 | carrossel 4:5 | OG 1.91:1}
[PALETA] cores primárias: {hex1}, {hex2} — fundo: {hex3}
[COMPOSIÇÃO] {regra indicada abaixo}
[TEXTO NA IMAGEM] "{texto principal}" — max 3 linhas, zona segura central
[ELEMENTOS OBRIGATORIOS] {logo posição + tamanho} | {tagline} | {CTA visual}
[ELEMENTOS PROIBIDOS] {rosto real | marca concorrente | claim não validado}
[ATMOSFERA] {palavras que descrevem o sentimento: sereno, energético, luxuoso, acolhedor}
```

### 5.2 Prompts prontos por tipo de post

#### Promocional (feed 1:1, saúde/beleza)
```
Product promotional instagram post, 1:1 square, warm cream background (#F7EDE0),
terracotta typography (#A0674A), bold center text "[OFERTA]",
clean minimal layout, golden ratio composition, white space, logo bottom right (small),
no people, no faces, no gradients, elegant serif font, high contrast CTA,
professional quality, calm luxury aesthetic
```

#### Educativo (carrossel, tech/B2B)
```
Educational instagram carousel slide, dark mode, deep navy background (#0F172A),
electric blue accent (#38BDF8), bold white headline top-third,
3-column icon grid center, minimal flat icons, geometric sans-serif typography,
progress indicator bottom (slide N/N), logo top right small,
clean information design, no stock photos, no faces
```

#### Relacional / Bastidor (feed, qualquer segmento)
```
Behind-the-scenes instagram post, authentic and warm aesthetic,
natural light photography style, slight film grain texture,
[PALETA DO SEGMENTO], overlaid text bottom-left with semi-transparent dark scrim,
handwritten-style caption font, editorial composition, human and real feeling,
no heavy filters, no studio look
```

#### Produto / Serviço (feed, qualquer segmento)
```
Product showcase instagram post, [NOME DO PRODUTO] center hero,
[PALETA DO SEGMENTO], clean studio background,
rule of thirds composition, product occupies 60% of frame,
text top-third "[NOME DO PRODUTO]" + bottom-third "[BENEFICIO PRINCIPAL]",
soft drop shadow, professional commercial photography style,
logo bottom right small, no clutter
```

#### Sazonal (story 9:16)
```
Instagram story for [DATA COMEMORATIVA], [SEGMENTO] brand,
full-bleed [COR PRIMÁRIA] background, large serif display text center,
[ELEMENTO VISUAL DA DATA — ex: flores, luz solar, etc.] decorative corner,
brand colors [HEX1 HEX2], swipe-up CTA bottom safe zone,
festive but not generic, elegant, no stock clip art
```

---

## 6. Safe zones do Instagram — zonas onde NÃO colocar texto ou elementos críticos

### Feed (1080 × 1080px)
```
┌─────────────────────────────┐  ← UI do app (foto de perfil + nome): 0–180px do topo
│    ZONA UI SUPERIOR         │     Nunca colocar CTA ou título aqui
│  (evitar: 0–180px topo)     │
├─────────────────────────────┤
│                             │
│   ZONA SEGURA CENTRAL       │  ← Texto principal, CTA, logo
│   (180px a 900px)           │
│                             │
├─────────────────────────────┤
│    ZONA UI INFERIOR         │  ← Ícones de curtida/comentário/compartilhar: 900px–1080px
│  (evitar: 900px–1080px)     │     Nunca colocar texto importante aqui
└─────────────────────────────┘
```

### Story / Reel (1080 × 1920px)
```
┌─────────────────────────────┐  ← Barra de progresso + info do perfil: 0–250px
│    ZONA UI SUPERIOR         │     Nunca colocar título ou CTA aqui
│  (evitar: 0–250px topo)     │
├─────────────────────────────┤
│                             │
│   ZONA SEGURA CENTRAL       │  ← Texto principal, imagem hero, gancho
│   (250px a 1620px)          │
│                             │
├─────────────────────────────┤
│    ZONA UI INFERIOR         │  ← Nome do perfil + botão de ação + link: 1620–1920px
│  (evitar: 1620px–1920px)    │     Reservar esta zona para CTA visual claro
└─────────────────────────────┘
```

### Carrossel (1080 × 1350px, 4:5)
```
┌─────────────────────────────┐  ← UI superior: 0–180px
│    ZONA UI SUPERIOR         │
├─────────────────────────────┤
│   ZONA SEGURA               │  ← Todo o conteúdo do slide
│   (180px a 1170px)          │
├─────────────────────────────┤
│    ZONA UI INFERIOR         │  ← Indicadores de slide: 1170–1350px
└─────────────────────────────┘
```

**Regra de texto em imagem:** texto não deve exceder **20% da área total** da imagem para posts impulsionados (Instagram penaliza imagens com muito texto em ads). Para posts orgânicos o limite é mais flexível mas manter abaixo de 30%.

---

## 7. Estrutura de carrossel (formato de maior alcance orgânico)

```
Slide 1 — GANCHO
  └── Título impactante (gancho da biblioteca)
  └── Subtítulo com promessa ou contexto (1 linha)
  └── Indicador: "Deslize →"

Slides 2-5 — DESENVOLVIMENTO (1 ideia por slide)
  └── Número do ponto + título do ponto (headline)
  └── Explicação: max 60 palavras
  └── Ícone ou elemento visual de apoio

Slide N-1 — RESUMO
  └── "Em resumo:" + bullet points (máx 5)

Slide final — CTA
  └── Ação específica: "Salve este post", "Mande para alguém que precisa", "Acesse o link na bio"
  └── Logo + handle do Instagram
  └── CTA visual (botão ou seta)
```

Máximo de slides: **10** (o Instagram permite 20 mas acima de 10 a taxa de conclusão cai).
Consistência visual: mesma paleta e tipografia em todos os slides — apenas o conteúdo muda.

---

## 8. Estrutura de story (sequência recomendada)

```
Frame 1 — ATENÇÃO (0–3s de atenção)
  └── Pergunta ou afirmação forte
  └── Imagem ou fundo forte
  └── Texto mínimo — 1 linha no máximo

Frame 2 — DESENVOLVIMENTO
  └── Contexto rápido (2-3 linhas) ou GIF/vídeo curto
  └── Enquete, caixa de perguntas ou quiz (quando for de engajamento)

Frame 3 — CTA / AÇÃO
  └── Link (se disponível) posicionado na zona segura inferior
  └── "Arrasta pra cima" (ou seta + "link na bio" se não houver swipe-up)
  └── Logo + handle visíveis
```

Stories têm vida de **24 horas**. Destaque (Highlight) estende se o conteúdo for evergreen.

---

## 9. Hashtags por segmento (listas base)

Usar como ponto de partida — validar relevância antes de incluir.

### Saúde / Beleza / Bem-estar
Amplas: `#saude #bemestar #autocuidado`
Específicas: `#massoterapia #drenagemlinfatica #estetica #pele #cuidadospessoais`
Locais: `#saude[cidade]` ex: `#saudesaopaulo`
Proibidas: `#emagrecer` (associada a spam), `#love` (irrelevante), `#follow4follow`

### Varejo / Moda
Amplas: `#moda #estilo #fashion`
Específicas: `#lookdodia #outfitoftheday #tendencia #modafeminina`
Locais: `#moda[cidade]`

### Alimentação
Amplas: `#gastronomia #comida #food`
Específicas: `#receitafacil #saudavel #artesanal #cafe #confeitaria`

### Tecnologia / SaaS
Amplas: `#tecnologia #tech #inovacao`
Específicas: `#startup #saas #automacao #atendimento #whatsapp`

### Educação
Amplas: `#educacao #aprender #conhecimento`
Específicas: `#curso #mentoria #carreira #desenvolvimento`

**Regra de hashtags em stories:** máximo 3, ou ocultar sob um sticker. Mais que isso parece spam.

---

## 10. Checklist de qualidade — obrigatório antes de entregar

### Copy
- [ ] Gancho está nos primeiros 125 caracteres (antes do "ver mais")
- [ ] Fórmula escolhida (PAS / FAB / FOMO / B-A-B) foi aplicada corretamente
- [ ] Nenhum claim de resultado, garantia, prazo ou desconto sem validação
- [ ] CTA é específico — não "saiba mais" genérico
- [ ] Caracteres dentro do limite do formato (promocional <400, educativo <2200)
- [ ] Hashtags: 5–12 no feed, máx 3 em story, relevantes para o segmento

### Imagem
- [ ] Texto na imagem está dentro das safe zones (ver Seção 6)
- [ ] Texto ocupa menos de 20% da área (para posts que podem ser impulsionados)
- [ ] Logo posicionada fora da zona UI inferior e superior
- [ ] Paleta de cores corresponde a `memory/marca.md` ou ao perfil do segmento em `design-visual`
- [ ] Fonte na imagem é a mesma família de `design-visual` (não Arial, não Roboto)
- [ ] Nenhum rosto real sem autorização registrada em `memory/marca.md`
- [ ] Resolução correta para o formato (ver tabela em `gerar-imagem-post`)

### Carrossel (quando aplicável)
- [ ] Slide 1 tem gancho claro
- [ ] Slide final tem CTA específico + logo + handle
- [ ] Máximo 10 slides
- [ ] Consistência visual em todos os slides

### Story (quando aplicável)
- [ ] Máximo 3 frames por sequência
- [ ] CTA no frame 3 na zona segura inferior
- [ ] Texto do frame 1 é de 1 linha no máximo

### Conformidade
- [ ] Sem dado pessoal de cliente no conteúdo (LGPD)
- [ ] Publicação depende de aprovação humana — status = rascunho
- [ ] Registrado em `memory/marketing.md` com id, formato e status

---

## 11. O que nunca fazer em Instagram

- Nunca colocar o título principal na zona UI superior (será coberto pela foto de perfil)
- Nunca usar hashtag genérica fora do segmento (`#love`, `#instagood`, `#photooftheday`)
- Nunca prometer desconto, prazo ou resultado sem dado validado em `memory/faq.md` ou `memory/vendas.md`
- Nunca usar filtro Facetune/AI-face em imagem de pessoa — parece falso
- Nunca usar gradiente roxo genérico como fundo (marca como conteúdo de IA sem personalidade)
- Nunca gerar story sem CTA no frame final — story sem ação é oportunidade desperdiçada
- Nunca usar mais de 2 fontes diferentes em uma única imagem
- Nunca repetir o mesmo gancho em 2 posts consecutivos
