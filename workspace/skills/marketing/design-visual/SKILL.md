---
name: design-visual
description: Referência de design para toda entrega visual da Lia — paletas por segmento, tipografia, layouts, tokens CSS e critérios de qualidade antes de entregar qualquer HTML ou imagem
triggers:
  - "criar layout"
  - "escolher cores"
  - "escolher fonte"
  - "identidade visual"
  - "template de site"
  - "design da página"
  - "estilo visual"
  - "paleta de cores"
  - "qual fonte usar"
depends_on:
  - consultar-memoria
used_by:
  - marketing/publicar-site-simples
  - marketing/catalogo-interativo
---

# Skill: Design Visual

Toda entrega HTML/CSS da Lia deve seguir estas diretrizes **antes de gerar qualquer código**.
Esta skill não é invocada diretamente pelo usuário — ela é a referência interna consultada
sempre que qualquer outra skill de frontend vai gerar output visual.

---

## 1. Processo antes de gerar HTML

1. Ler `memory/marca.md` — extrair: cores primárias, fontes, elementos proibidos, tom visual.
2. Identificar o **segmento** da empresa (em `memory/empresa.md`): saúde, beleza, varejo, alimentação, tecnologia, educação, serviços.
3. Escolher o **perfil de design** correspondente na Seção 2.
4. Aplicar o **template de tokens CSS** da Seção 3, ajustando com as cores da marca.
5. Escolher o par de **fontes** da Seção 4.
6. Montar o HTML usando um dos **layouts** da Seção 5.
7. Passar pelo **checklist de qualidade** da Seção 6 antes de salvar.

Se `memory/marca.md` tiver cores definidas, **elas sobrepõem** o perfil padrão do segmento.
Se `memory/marca.md` estiver vazio ou inexistente, usar o perfil do segmento como padrão.

### 1.1 Fonte única de tokens (anti-drift)

O bloco de tokens da marca mora em **um lugar só**: a seção
`## Tokens CSS (fonte única)` de `memory/marca.md`. Regras:

- Toda página/arte deriva o `:root` **desses** valores — nunca digite hex
  "de cabeça" nem copie de uma página antiga.
- Se `memory/marca.md` ainda não tem a seção de tokens, na primeira geração
  você a **cria** a partir do perfil do segmento (Seção 2) + o que houver de
  cor/logo na marca, e pede validação do dono. A partir daí ela é a verdade.
- Quando o dono mudar uma cor, ele muda em `memory/marca.md`. As páginas
  geradas depois disso refletem; as antigas são regeradas sob demanda (não
  existe atualização mágica de arquivos já publicados — avise isso ao Rafael
  se uma troca de marca exigir regerar peças no ar).
- A regra de "HTML autônomo (CSS inline)" continua valendo: os tokens são
  **copiados inline** no `:root` de cada arquivo. A fonte única é a memória,
  não um `.css` externo — assim a página continua portátil e o link público
  não depende de um segundo request.

Antes de gerar, confirme: "os hex que vou usar batem com a seção de tokens de
`memory/marca.md`?" Se não baterem, ou você está com perfil errado ou a marca
mudou — resolva antes de gerar.

---

## 2. Perfis de design por segmento

### 2.1 Saúde / Bem-estar / Beleza
**Conceito**: orgânico, caloroso, confiável.

```
--primary:    #A0674A   /* terracota */
--primary-dk: #7A4A33   /* terracota escuro */
--bg:         #F7EDE0   /* creme */
--bg-card:    #FEFAF6   /* branco quente */
--accent:     #C9A882   /* areia dourada */
--text:       #3D2314   /* marrom escuro */
--text-muted: #8A7367   /* cinza quente */
--success:    #25D366   /* WhatsApp green */
```

Fonte título: `Playfair Display` (serif elegante)
Fonte corpo: `DM Sans` (humanist sans, legível)
Tom: acolhedor, limpo, com muito espaço branco, texturas suaves.

---

### 2.2 Varejo / Moda / Lifestyle
**Conceito**: editorial, moderno, aspiracional.

```
--primary:    #1A1A2E   /* azul-marinho profundo */
--primary-dk: #0D0D1A
--bg:         #FAFAFA
--bg-card:    #FFFFFF
--accent:     #C9A84C   /* dourado */
--text:       #111111
--text-muted: #666666
--success:    #25D366
```

Fonte título: `Cormorant Garamond` (serif fashion)
Fonte corpo: `Jost` (geometric sans, contemporâneo)
Tom: tipografia grande e dominante, muita assimetria, imagem em full-bleed.

---

### 2.3 Alimentação / Gastronomia / Café
**Conceito**: apetitoso, artesanal, convidativo.

```
--primary:    #2D5016   /* verde-floresta */
--primary-dk: #1A3009
--bg:         #FFF8F0   /* creme quente */
--bg-card:    #FFFFFF
--accent:     #E07A2F   /* laranja caramelado */
--text:       #1C1C1C
--text-muted: #6B5B4E
--success:    #25D366
```

Fonte título: `Libre Baskerville` (serif robusto)
Fonte corpo: `Source Sans 3` (legível, neutro)
Tom: orgânico, fotografia de produto dominante, CTA direto e quente.

---

### 2.4 Tecnologia / SaaS / B2B
**Conceito**: preciso, moderno, confiável.

```
--primary:    #2563EB   /* azul elétrico */
--primary-dk: #1D4ED8
--bg:         #0F172A   /* slate dark */
--bg-card:    #1E293B
--accent:     #38BDF8   /* sky blue */
--text:       #F1F5F9
--text-muted: #94A3B8
--success:    #4ADE80
```

Fonte título: `Space Grotesk` (geometric, tech)
Fonte corpo: `Inter` (neutro, ultra-legível)
Tom: modo escuro por padrão, grid rígido, badge + número de destaque, CTA contrastante.

> Exceção: quando for B2C/consumidor, usar fundo claro `#F8FAFC` com text `#0F172A`.

---

### 2.5 Educação / Cursos / Consultoria
**Conceito**: confiança, expertise, clareza.

```
--primary:    #7C3AED   /* violeta */
--primary-dk: #5B21B6
--bg:         #FAFAFA
--bg-card:    #FFFFFF
--accent:     #F59E0B   /* âmbar */
--text:       #1F2937
--text-muted: #6B7280
--success:    #25D366
```

Fonte título: `Sora` (rounded sans, amigável)
Fonte corpo: `Nunito` (rounded, acessível)
Tom: espaçamento generoso, bullet points visuais, foto de instrutor com moldura de destaque.

---

### 2.6 Serviços / Profissional Liberal / Advocacia / Contabilidade
**Conceito**: seriedade, credibilidade, organização.

```
--primary:    #1E3A5F   /* azul-noite */
--primary-dk: #122441
--bg:         #F5F7FA
--bg-card:    #FFFFFF
--accent:     #B8860B   /* dourado sóbrio */
--text:       #1A1A1A
--text-muted: #555555
--success:    #25D366
```

Fonte título: `Lora` (serif clássico, autoridade)
Fonte corpo: `Mulish` (clean, profissional)
Tom: muito texto permitido se organizado, listas numeradas, rodapé completo, CNPJ visível.

---

## 3. Template de tokens CSS

Todo HTML gerado **deve** abrir com este bloco de variáveis no `:root`, preenchido com os valores do perfil escolhido:

```css
:root {
  /* Cores — substituir com perfil do segmento ou marca.md */
  --primary:      #A0674A;
  --primary-dk:   #7A4A33;
  --bg:           #F7EDE0;
  --bg-card:      #FEFAF6;
  --accent:       #C9A882;
  --text:         #3D2314;
  --text-muted:   #8A7367;
  --success:      #25D366;

  /* Tipografia */
  --font-title:   'Playfair Display', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
  --font-size-base: 16px;
  --line-height:  1.65;

  /* Espaçamento */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 32px;
  --space-xl: 64px;

  /* Layout */
  --container:    680px;
  --radius:       12px;
  --radius-lg:    20px;
  --shadow:       0 4px 24px rgba(0,0,0,.08);
  --shadow-lg:    0 8px 40px rgba(0,0,0,.14);

  /* Transições */
  --ease:         cubic-bezier(.4,0,.2,1);
  --duration:     .25s;
  --transition:   var(--duration) var(--ease);
}
```

---

## 4. Pares de fontes por segmento

| Segmento | Título (Google Fonts) | Corpo (Google Fonts) | Link @import |
|---|---|---|---|
| Saúde/Beleza | Playfair Display | DM Sans | `family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500` |
| Varejo/Moda | Cormorant Garamond | Jost | `family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500` |
| Alimentação | Libre Baskerville | Source+Sans+3 | `family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;600` |
| Tecnologia | Space Grotesk | Inter | `family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500` |
| Educação | Sora | Nunito | `family=Sora:wght@400;600;700&family=Nunito:wght@400;600` |
| Serviços/Prof | Lora | Mulish | `family=Lora:wght@400;600;700&family=Mulish:wght@400;500;600` |

Link de import sempre via `https://fonts.googleapis.com/css2?{query}&display=swap`.
Incluir `<link rel="preconnect" href="https://fonts.googleapis.com">` antes.

---

## 5. Layouts disponíveis

### L1 — Landing Page Simples (padrão para campanhas)

```
[HERO] fundo colorido com título grande + subtítulo + botão CTA
[BENEFÍCIOS] 3 cards lado a lado (ou coluna no mobile)
[PROVA SOCIAL] 1-3 depoimentos ou número de destaque
[CTA FINAL] fundo escuro, chamada direta, botão WhatsApp
[RODAPÉ] nome + CNPJ + endereço + contato
```

### L2 — Catálogo de Produtos/Serviços

```
[HERO] título + tagline + strip de promoção (opcional)
[GRID DE CARDS] 2 colunas desktop / 1 coluna mobile
  └── card: ícone + nome + descrição + preço + botão
[CTA WHATSAPP] fixo no fundo (FAB) ou section final
[RODAPÉ]
```

### L3 — Link-in-Bio

```
[PERFIL] avatar + nome + bio curta
[BOTÕES] lista vertical de links (máx. 6)
[REDES SOCIAIS] ícones inline
```

### L4 — Página de Evento / Lançamento

```
[HERO] countdown + título + descrição breve
[AGENDA] lista de horários/etapas
[PALESTRANTES/PRODUTOS] cards com foto + nome + papel
[INSCRIÇÃO / AVISO] CTA ou formulário externo (link)
[RODAPÉ]
```

Escolher o layout antes de gerar. Nunca misturar mais de dois layouts numa mesma página.

---

## 6. Checklist de qualidade — obrigatório antes de entregar

### Contraste e acessibilidade
- [ ] Texto sobre fundo passa WCAG AA (ratio ≥ 4.5:1 para texto normal, ≥ 3:1 para texto grande)
- [ ] Fonte mínima 16px no corpo, 14px em notas de rodapé
- [ ] Botões têm `aria-label` quando o texto não é descritivo
- [ ] Imagens têm `alt` textual

### Responsividade
- [ ] Layout funciona em 375px (iPhone SE) sem scroll horizontal
- [ ] `max-width: var(--container)` centrado no desktop
- [ ] Botões com mínimo 44px de altura no mobile
- [ ] Grid usa `repeat(auto-fit, minmax(…))` ou media query explícito

### Performance
- [ ] Nenhum JS externo — só o que for escrito inline no `<script>`
- [ ] Nenhuma imagem embutida como base64 acima de 5KB — usar URL de asset
- [ ] Google Fonts carregado com `display=swap` e `preconnect`
- [ ] Total do HTML abaixo de 100KB

### Conteúdo
- [ ] Sem dado inventado (telefone, CNPJ, preço, endereço, prazo)
- [ ] CTA principal aponta para `https://wa.me/55{número}` correto
- [ ] CNPJ e endereço no rodapé (ou campo PENDENCIAS se não tiver)
- [ ] Link de política de privacidade no rodapé

### Identidade visual
- [ ] Cores correspondem ao perfil do segmento ou à marca.md
- [ ] Fonte título ≠ fonte corpo (dois pesos distintos)
- [ ] Nenhum gradiente violeta-genérico ou paleta "AI default"
- [ ] Grain/texture overlay (SVG noise) aplicado onde couber

---

## 7. Elementos visuais reutilizáveis

### Grain overlay (textura de ruído)
```css
body::before {
  content: '';
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  opacity: .03;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
}
```

### Divisor orgânico entre seções
```css
.section-wave::after {
  content: '';
  position: absolute;
  bottom: -2px; left: 0; right: 0;
  height: 48px;
  background: var(--bg);
  clip-path: ellipse(55% 100% at 50% 100%);
}
```

### Card com hover lift
```css
.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: transform var(--transition), box-shadow var(--transition);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}
```

### Botão primário
```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--transition), transform var(--transition);
}
.btn-primary:hover {
  background: var(--primary-dk);
  transform: translateY(-1px);
}
```

### FAB WhatsApp (fixo no canto)
```css
.fab-wa {
  position: fixed;
  bottom: 24px; right: 24px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--success);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 14px 22px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: .95rem;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(37,211,102,.4);
  text-decoration: none;
  transition: transform var(--transition), box-shadow var(--transition);
}
.fab-wa:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 28px rgba(37,211,102,.5);
}
```

---

## 8. O que nunca fazer

- Nunca usar fundo branco puro `#FFFFFF` como cor de página inteira — usar `--bg` levemente tonalizado
- Nunca usar `font-family: Arial, sans-serif` ou `font-family: Roboto` — são fontes genéricas demais
- Nunca usar gradiente de roxo para branco (`#7c3aed → #ffffff`) como estilo principal — é clichê de AI
- Nunca colocar mais de 3 cores primárias na mesma página — viola coesão visual
- Nunca gerar `<table>` para layout — usar CSS Grid ou Flexbox
- Nunca usar `!important` exceto para `.hidden { display: none !important; }`
- Nunca deixar `alt=""` em imagem com conteúdo semântico
- Nunca gerar imagem embutida em base64 para foto de produto — usar URL de asset ou placeholder
