# Relatório de Melhorias — Templates Gerados por Lia

**Data**: 2026-05-22  
**Analista**: agente-picoclaw-test  
**Arquivos analisados**: `bella-vida-catalogo.html`, `bella-vida-promo-maio.html`

---

## Resumo executivo

Os templates gerados por Lia são **funcionalmente corretos** e seguem as regras do workspace (sem emoji, mobile-first, LGPD, CTA WhatsApp). Contudo, apresentam limitações de design e interatividade que os deixam abaixo do padrão de produção moderno: tipografia genérica, ausência de micro-interações, dados hardcoded (impossível editar sem abrir o HTML), e sem fluxo de checkout estruturado. Um catálogo que envia o pedido para o WhatsApp e pode ser editado sem código é uma demanda central para o negócio.

---

## Análise dos templates

### `bella-vida-catalogo.html`

| Aspecto | Avaliação | Nota |
|---|---|---|
| Estrutura HTML semântica | Header, main, footer, articles, sections corretas | 9/10 |
| Mobile-first / viewport | Sim, grid adapta em 600px | 8/10 |
| Tipografia | Georgia (fallback genérico, sem web font) | 5/10 |
| Hierarquia visual | Flat — todos os cards têm mesmo peso | 5/10 |
| Animações / micro-interações | Nenhuma | 2/10 |
| Ícones | SVG externo com fallback CSS (ícones não existem) | 4/10 |
| Dados editáveis | Hardcoded no HTML | 1/10 |
| Checkout / pedido | Apenas link WhatsApp genérico | 2/10 |
| Acessibilidade | aria-labels corretos, contraste OK | 8/10 |
| LGPD básica | Presente no rodapé | 8/10 |

**Nota geral**: 5,2/10

### `bella-vida-promo-maio.html`

| Aspecto | Avaliação | Nota |
|---|---|---|
| Estrutura HTML semântica | Boa — seções nomeadas, roles corretos | 9/10 |
| Hero com imagem overlay | Implementado (img não existe, mas estrutura correta) | 7/10 |
| OG/meta tags | Completas — og:title, og:image, twitter:card | 10/10 |
| Contador de urgência | Estático (texto, não JS dinâmico) | 4/10 |
| Benefícios com SVG inline | Limpo e acessível | 8/10 |
| Tipografia | Georgia (genérica) | 5/10 |
| Animações | Nenhuma | 2/10 |
| CTA WhatsApp | Funcional com número correto | 9/10 |
| LGPD | Parágrafo completo | 9/10 |

**Nota geral**: 7,0/10

---

## Falhas identificadas

### P1 — Bloqueantes

| ID | Descrição | Impacto |
|---|---|---|
| F01 | Dados do catálogo hardcoded em HTML — impossível editar sem código | Cliente não consegue atualizar serviços/preços sem desenvolvedor |
| F02 | Checkout envia apenas para número genérico sem listar serviços escolhidos | Perda de conversão — cliente tem que explicar tudo no WhatsApp |
| F03 | SVGs de ícone referenciados mas não existem (`/public/marketing/assets/icon-*.svg`) | Cards aparecem sem ícone visual em produção |

### P2 — Melhorias importantes

| ID | Descrição |
|---|---|
| F04 | Tipografia genérica (Georgia fallback) — sem web font distinta |
| F05 | Contador de urgência estático — sem countdown em JS |
| F06 | Sem micro-interações (hover cards, botão animado) |
| F07 | Sem seleção de serviços ou quantidade |
| F08 | Sem modo admin para o dono editar conteúdo sem código |
| F09 | og:url hardcoded como `localhost:18800` em produção |

### P3 — Melhorias desejáveis

| ID | Descrição |
|---|---|
| F10 | Sem suporte a múltiplos idiomas |
| F11 | Sem analytics básico (page views por pixel/GA) |
| F12 | Sem formulário de captura de lead (apenas WhatsApp) |

---

## Melhorias implementadas — Catálogo v2

O arquivo `public/marketing/catalogo-v2.html` implementa todas as correções P1 e P2:

### Funcionalidades novas

1. **Mini-admin integrado** (`#admin` + PIN)
   - Adicionar, editar e remover serviços/produtos
   - Campos: nome, descrição, preço, ícone, disponibilidade
   - Dados salvos em `localStorage` + export JSON
   - Importar JSON para migrar entre dispositivos

2. **Carrinho + Checkout WhatsApp**
   - Botão "Adicionar" em cada card
   - Drawer lateral com itens selecionados e quantidades
   - "Finalizar" compõe mensagem estruturada e abre WhatsApp:
     ```
     Olá! Gostaria de agendar os seguintes serviços:
     • Massoterapia (1x) — R$ 150
     • Drenagem Linfática (2x) — R$ 120 cada
     Total estimado: R$ 390
     ```

3. **Solicitar alteração**
   - Botão flutuante "Sugerir alteração"
   - Modal com opções: adicionar serviço, remover serviço, alterar preço, outro
   - Abre WhatsApp com mensagem pré-formatada para o dono

4. **Design de produção**
   - Web fonts via Google Fonts (Playfair Display + DM Sans)
   - Hover lift nos cards
   - Countdown JS para data de validade da promoção
   - Grain texture overlay
   - Skeleton loading animation

---

## Recomendações para a skill `publicar-site-simples`

1. Gerar `catalogo-v2.html` em vez do template flat atual
2. Incluir instrução para passar `PICOCLAW_PUBLIC_BASE_URL` nas meta og:url
3. Criar template de catálogo com suporte nativo a JSON de produtos
4. Exigir que ícones sejam embutidos como SVG inline (não referências externas)

---

## Próximos passos

- [ ] Dono preenche `memory/empresa.md` e `memory/marca.md` com dados reais
- [ ] Dono acessa `catalogo-v2.html#admin`, faz login com PIN e cadastra serviços reais
- [ ] Lia passa a gerar `catalogo-v2.html` como template padrão
- [ ] Integrar geração de imagem real (DALL-E / Ideogram) para substituir placeholder `bella-vida-promo-hero.png`
