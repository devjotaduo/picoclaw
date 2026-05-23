---
name: color-palette-refinement
description: Refine a user-selected color option into a practical palette and usage guidance. Use when the user chooses colors and implicitly wants elaboration, a more polished version, or applied recommendations for branding, UI, logo, site, or social visuals.
---
# Color Palette Refinement

Use this skill when the user has already selected a color direction and the next helpful move is to turn that choice into something more usable.

Typical triggers:
- The user picks colors such as "dark blue, white, and light gray"
- The user repeats or confirms a chosen hex color
- The user implicitly wants the palette finalized, improved, or applied
- The user asks for something like a more sophisticated, modern, or practical version
- The user wants usage guidance for logo, website, Instagram, buttons, highlights, or brand materials

## What to deliver

Choose the smallest useful output that advances the user’s choice:

1. **Base palette finalization**
   - Return 3 main colors with hex codes
   - Explain the role of each color

2. **Refined palette expansion**
   - Keep the selected colors
   - Add support colors only if useful, such as accent, border, hover, or background shades

3. **Applied usage guide**
   - Map colors to practical elements such as:
     - titles
     - buttons
     - backgrounds
     - cards or boxes
     - dividers
     - highlights
     - text

4. **Style variation set**
   - Provide labeled variants such as:
     - more sophisticated
     - more modern
     - more elegant
     - warmer
     - higher contrast

## Core workflow

### 1. Confirm the chosen direction
Identify the colors the user has selected or accepted.

If the user names colors without hex codes:
- keep the named colors
- assign sensible hex values only when doing so is helpful
- prefer clean, broadly usable values over overly stylized picks

If the user provides a hex code:
- preserve it exactly unless the user asks for alternatives

### 2. Infer the practical need
From the wording, determine the most likely next step.

Common inferences:
- If the user simply confirms a color, they likely want the palette closed out or expanded
- If they say the option is good, they likely want practical application
- If they ask for refinement, they likely want tone variation or a more polished set
- If the context mentions brand, logo, site, or Instagram, include applied mapping

Do not ask a clarifying question if a solid next-step palette answer can be given immediately.

### 3. Build the palette
Start from the user’s chosen colors.

Recommended structure:
- 1 primary color
- 1 neutral light background color
- 1 neutral support color or soft contrast color
- optional 1 accent color only if it improves usability or emphasis

Palette construction rules:
- Preserve the emotional direction implied by the chosen colors
- Keep contrast practical and clean
- Avoid adding too many colors unless the user explicitly wants a fuller system
- For professional or institutional tone, prioritize restrained neutrals and stable primary colors
- For modern tone, use cleaner contrast and slightly fresher accent balance

### 4. Assign roles
For each color, state where it should be used.

Useful role categories:
- primary: titles, buttons, important highlights, icons
- background: main page or canvas background
- support: cards, sections, soft panels, borders, separators
- accent: CTA emphasis, links, hover states, badges
- text: main text or secondary text when needed

### 5. Respond in a practical format
Preferred default format:
- short positive confirmation
- 3 to 5 bullet palette with hex codes
- usage recommendations by interface or brand element
- optional next-step options

Example response shape:
- brief affirmation
- palette list
- "recommended use" section
- optional offer to generate a sophisticated, modern, or applied version

## Output guidelines

### If the user chose a simple professional palette
Return something like:
- Primary color with hex
- White or off-white background
- Light gray support tone
- Clear role mapping

### If the user confirms a neutral support color
Treat that as a signal to finalize the full palette around it.
Do not reply only about that one color unless the user explicitly wants isolated validation.

### If the user seems undecided but positive
Offer exactly 2 or 3 concrete next steps, for example:
- final palette with support colors
- button and highlight combinations
- mini visual guide for logo/site/Instagram

## Avoid patterns

Avoid:
- abstract color theory without practical application
- long branding essays
- asking unnecessary clarifying questions before offering a workable palette
- inventing a large design system when the user only needs a compact palette
- changing the chosen color direction too aggressively
- returning colors without usage roles

## Response quality bar

A strong answer should:
- preserve the user’s chosen palette direction
- make the palette more actionable
- include hex codes when useful
- explain where each color should be used
- suggest one or more practical next outputs if the conversation is still open

## Example learned pattern

When a user selects a combination such as dark blue, white, and light gray, a good next response is to:
1. affirm the choice briefly
2. present a practical palette with hex values
3. map dark blue to titles, buttons, and highlights
4. map white to the main background
5. map light gray to support areas, boxes, and dividers
6. offer a refined next step such as a more sophisticated version, a more modern version, or an application for logo/site/Instagram