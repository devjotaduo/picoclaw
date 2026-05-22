# Avaliação de Qualidade — Skills de Instagram
**Data:** 2026-05-22
**Avaliado por:** Agente de Auditoria — Picoclaw Workspace
**Escopo:** `criar-post-instagram` + `gerar-imagem-post`

---

## Resumo executivo

As duas skills de Instagram da Lia cobrem o fluxo básico (legenda + imagem) mas operam
com diretrizes excessivamente genéricas. `criar-post-instagram` define estrutura de copy
mas não diferencia por tipo de post, formato ou segmento. `gerar-imagem-post` exige
"prompt visual" sem dar ao agente nenhuma estrutura, composição ou referência estética.
O resultado é output funcional mas visualmente medíocre — equivalente ao que uma IA
produziria sem nenhuma orientação de design. Nota atual: **5.5 / 10**.

---

## Avaliação por skill

### 1. `criar-post-instagram`

**Nota: 5.8 / 10**

| Critério | Peso | Nota | Observação |
|---|---|---|---|
| Estrutura de copy | 20% | 6.0 | Genérica: gancho+contexto+valor+CTA. Sem fórmulas testadas (PAS, AIDA, B/A/B) |
| Diferenciação por formato | 15% | 3.0 | Menciona feed/story/reel/carrossel mas não especifica como copy muda entre eles |
| Hooks / ganchos | 20% | 4.0 | Nenhum exemplo ou biblioteca de ganchos. "Deve fazer parar de rolar" é instrução vaga |
| Hashtags | 10% | 6.0 | Regra 5-12 é razoável mas sem critério por segmento ou lista de hashtags proibidas |
| Carrossel | 10% | 2.0 | Não há especificação de estrutura de slides (carrossel é o formato de maior alcance orgânico no IG) |
| Limite de caracteres | 10% | 3.0 | Sem menção ao limite de 2.200 chars ou ao ideal de engajamento por formato |
| Stories | 10% | 3.0 | Não há instrução para stories: sequência, enquetes, stickers, link |
| Regras de copy proibida | 5% | 8.0 | OK: não prometer garantia, claim médico etc. |

**Falhas críticas:**
- **F1**: Sem biblioteca de ganchos → Lia gera ganchos genéricos que não param o scroll
- **F2**: Carrossel sem estrutura de slides → o formato de maior alcance orgânico não tem spec
- **F3**: Stories sem dinâmica própria → completamente ignorado como formato

**Melhorias P1:**
- Adicionar biblioteca de 12 ganchos por categoria (curiosidade, problema, número, contraste, pergunta)
- Adicionar estrutura de carrossel: slide 1 = gancho, slides 2-6 = desenvolvimento, slide final = CTA
- Adicionar spec de stories: sequência de 3-5 frames, enquete, CTA no último frame

---

### 2. `gerar-imagem-post`

**Nota: 5.2 / 10**

| Critério | Peso | Nota | Observação |
|---|---|---|---|
| Prompt engineering | 25% | 4.0 | "Montar prompt visual" sem template estruturado. Sem diferenciar por segmento |
| Composição visual | 20% | 3.0 | Regra dos terços, hierarquia, zonas seguras de UI não mencionadas |
| Texto em imagem | 15% | 4.0 | Sem regra de proporção de texto (ideal <20% da área para ads) |
| Estilos por tipo | 15% | 5.0 | Menciona "clean e moderno" como exemplo mas sem biblioteca de estilos |
| Safe zones do Instagram | 10% | 2.0 | Instagram cobre ~14% superior e ~18% inferior com UI — não mencionado |
| Brand safety | 10% | 7.0 | Proíbe rostos não autorizados e marcas de terceiros |
| Formatos especificados | 5% | 8.0 | Tabela de resoluções está correta e completa |

**Falhas críticas:**
- **F4**: Sem prompt templates → Lia improvisa prompts a cada geração, resultado inconsistente
- **F5**: Sem zonas seguras do Instagram → CTA ou texto importante pode ficar coberto pela UI
- **F6**: Sem composição por tipo de post → promotional ≠ educational ≠ product showcase

**Melhorias P1:**
- Criar prompt templates por tipo (promocional, educativo, produto, relacional)
- Adicionar mapa de safe zones para feed e story
- Definir 4 estilos visuais com descrição para Lia escolher

---

## Comparativo

| Skill | Antes | Após skill `design-instagram` |
|---|---|---|
| `criar-post-instagram` | Estrutura genérica, sem hooks, sem carrossel | Fórmulas testadas, biblioteca de hooks, spec de carrossel e stories |
| `gerar-imagem-post` | "Prompt visual" genérico | Templates de prompt por tipo, safe zones, composição por segmento |

---

## Nota geral das skills de Instagram

**5.5 / 10**

Justificativa: as skills garantem que a Lia não inventa dados e pede aprovação humana
(critérios de compliance OK), mas não dão ao agente as ferramentas para produzir
conteúdo visualmente diferenciado ou copywriting que converte. São skills de processo,
não de qualidade. A skill `design-instagram` sobe o teto para ~8.5.
