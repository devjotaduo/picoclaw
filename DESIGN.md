# DESIGN.md

## Design Intent

The launcher is product UI for daily operation. It should feel restrained,
precise, and reliable: a compact console for supervising AI agents, channels,
gateway state, and tenant configuration.

Physical scene: an operator or tenant admin is checking gateway, WhatsApp, and
agent status during work hours on a laptop or desktop, often while solving a
blocked conversation. The UI should reduce ambiguity and avoid dramatic visual
effects.

## Theme Model

- Light mode is the base `:root` theme.
- Dark mode is controlled by the `.dark` class.
- Do not depend on `:root.light` or `data-theme="light"` for essential tokens.
- Keep the same component structure and font family across both themes.
- Prefer restrained tinted neutrals plus one operational accent.

## Color Tokens

Current token source: `web/frontend/src/index.css`.

- Light surfaces: near-white background and card surfaces with clear dark text.
- Dark surfaces: warm charcoal, using values close to `#20201f` for the app
  background, `#2c2c2a` for cards, and `#181817` for the sidebar.
- Foreground in dark mode: close to `#f9f9f7`.
- Muted text in dark mode: close to `#97958d`.
- Primary accent: warm clay around `#d97757`, used sparingly.
- Gateway connect action: emerald at AA contrast, currently
  `bg-emerald-700 text-white` and `hover:bg-emerald-800`.
- Destructive or disconnected states: red tones, but avoid alarm-heavy full
  surfaces unless the action is destructive.

## Contrast Rules

- Normal text: minimum `4.5:1`.
- Muted explanatory text that blocks progress: minimum `4.5:1`.
- Icon-only controls and sidebar icons: minimum `3:1`.
- Disabled composer placeholder must remain legible, using full
  `text-muted-foreground` when input is unavailable.
- Buttons with white text must use backgrounds dark enough for `4.5:1`.

## Typography

- Sans family: `"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif`.
- Do not use `"Anthropic Sans"` unless it is actually imported and adopted
  across both themes.
- Product UI should use compact, predictable type:
  - App title: strong but not oversized.
  - Section labels: 10 to 12 px, uppercase only when they aid scanning.
  - Body and status copy: 14 to 16 px.
  - Buttons: medium weight, concise text.
- Avoid hero-scale typography inside panels, dashboards, sidebars, and tools.
- Letter spacing should be `0` unless a small uppercase label needs subtle
  tracking.

## Layout

- Use a top bar plus left navigation as the primary app shell.
- Keep navigation stable between light and dark modes.
- Avoid landing-page composition for authenticated product routes.
- Use cards only for repeated items, focused panels, modals, and framed tools.
- Do not put cards inside cards.
- Maintain stable dimensions for fixed-format elements such as sidebars,
  toolbars, icon buttons, counters, tiles, and status orbs.
- Empty states should be centered only when the surrounding workflow is blocked.
  Operational pages should otherwise preserve their tool layout.

## Components

- Buttons should use icons when the action has a familiar symbol, especially for
  compact toolbar controls.
- Primary text buttons are for clear commands such as "Conectar" or
  "Testar atendente".
- Status badges must be readable and should not rely on color alone.
- Inputs and disabled composers need clear explanatory copy, not faded text.
- The pending panel should stay simple: label, optional navigation, and a
  concise empty or blocked state.
- Sidebar items should prioritize scanning: icon plus label when expanded,
  icon-only when collapsed with accessible names and hover affordances.

## AI Orb

- Source asset: `web/frontend/public/ai-orb-loop.gif`.
- Component owner: `web/frontend/src/components/chat/ai-orb-avatar.tsx`.
- The orb is the only approved decorative AI visual in the core product UI.
- Connected or neutral state can use the original blue treatment.
- Disconnected gateway state should use the orb treatment in red tones.
- The animation should loop continuously without visible pauses.
- Do not add extra glow blobs, gradient backgrounds, or unrelated decorative
  spheres around it.

## Motion

- Motion should communicate state, not decorate.
- Avoid animating layout properties.
- Use short ease-out transitions for hover, focus, active, and status changes.
- Long ambient animation is acceptable only for the orb, and it must not
  distract from blocked-state copy.

## Accessibility And QA

- Validate both `http://127.0.0.1:5173/` light and dark modes after visual
  changes.
- Check the blocked gateway chat state, no-model state, expanded sidebar, and
  collapsed sidebar.
- Confirm body text, muted text, placeholders, and command buttons meet the
  contrast rules above.
- Backend 502 or disconnected gateway states are valid visual states during
  frontend validation and should remain readable.
