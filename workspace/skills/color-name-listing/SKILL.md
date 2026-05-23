---
name: color-name-listing
description: Provide a general list of color names when the user asks for colors in a broad, non-technical way. Use when the user wants a simple color list rather than palette refinement, design application, or image prompting.
---
# Color Name Listing

Use this skill when the user asks for a general list of colors, such as "me dê uma lista de cores" or "list color names," without asking for branding advice, palette building, or codes.

## What to deliver
Choose the smallest useful response that satisfies the request:

1. **Basic color list**
- Provide a short list of common color names.
- Use simple formatting, usually bullets.

2. **Expanded color list**
- If the user seems to want more variety, include additional shades or less common names.

3. **Optional follow-up options**
- Offer 3 to 5 relevant next steps, such as:
  - colors for branding
  - pastel colors
  - elegant colors
  - vibrant palette
  - colors with hex codes

## When to use this skill
Use this skill when:
- The user asks for a list of colors.
- The request is broad and generic.
- No specific design, branding, or UI context is required.
- The user does not ask for hex, RGB, CMYK, or applied recommendations.

## When not to use this skill
Do not use this skill when:
- The user already selected colors and wants refinement or application guidance.
- The user wants a polished palette for brand, logo, site, or social media.
- The user asks for image prompt creation.
- The user requests technical color specifications only.

## Execution steps

### 1. Read the request literally
Determine whether the user only wants a plain list of color names.

Signals:
- "lista de cores"
- "me diga cores"
- "color names"
- "quais cores existem"

If the user includes no extra constraint, default to a general-purpose list.

### 2. Choose list size
Use one of these sizes:
- **Short**: 8 to 12 colors for a quick answer.
- **Standard**: 15 to 20 colors for most requests.
- **Extended**: 25+ only if the user explicitly wants many options.

Default to **standard**.

### 3. Build the list
Prefer common, recognizable names first. A good default set includes:
- Azul
- Verde
- Vermelho
- Amarelo
- Laranja
- Roxo
- Rosa
- Preto
- Branco
- Cinza
- Marrom
- Bege
- Dourado
- Prata
- Turquesa
- Lilás
- Coral
- Bordô
- Mostarda
- Azul-marinho

If useful, swap or add familiar variants such as:
- Vinho
- Creme
- Salmão
- Magenta
- Ciano
- Verde-oliva
- Terracota

### 4. Format clearly
Return the result as a direct answer with a short intro and bullet list.

Recommended pattern:
- brief acknowledgment
- "Aqui vai uma lista de cores:"
- bullet list

Avoid long explanations unless the user asks for them.

### 5. Offer optional next steps
After the list, optionally offer a few adjacent options if they are genuinely useful.

Good examples:
- cores para marca
- paleta elegante
- paleta vibrante
- tons pastel
- cores com código hex

Keep this brief and optional.

## Output style
- Be direct and helpful.
- Prefer the user's language.
- Do not over-explain basic color names.
- Do not invent unnecessary categories.

## Example response shape
Claro.\nAqui vai uma lista de cores:\n\n- Azul\n- Verde\n- Vermelho\n- Amarelo\n- Laranja\n- Roxo\n- Rosa\n- Preto\n- Branco\n- Cinza\n- Marrom\n- Bege\n- Dourado\n- Prata\n- Turquesa\n- Lilás\n- Coral\n- Bordô\n- Mostarda\n- Azul-marinho\n\nSe quiser, também posso te passar:\n- cores para marca\n- paleta elegante\n- paleta vibrante\n- paleta com código hex

## Boundary conditions
- If the user asks only for names, do not force hex codes.
- If the user asks for a palette, switch to a palette-oriented skill instead.
- If the user asks for colors for a specific purpose, include only a short list here or route to a more specialized skill.

## Learning provenance for review
Source task evidence showed repeated successful direct answers to broad requests for "lista de cores" with no skill used. The winning behavior was a concise bullet list of common color names plus a brief optional offer for related follow-ups such as branding colors, elegant palettes, or hex codes. This pattern did not clearly belong inside color-palette-refinement because the user had not chosen any colors and did not ask for refinement.