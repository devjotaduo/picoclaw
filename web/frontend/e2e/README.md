# Agent Editor — Playwright E2E

Cobertura mínima dos fluxos do refator P0–P3 (`/agent/editor`).

## Pré-requisitos

- Launcher rodando em `http://localhost:18800` (`make build-launcher` + serviço dev/prod local), **logado** — o login do dashboard precisa estar válido no navegador que o Playwright vai abrir.
- Pelo menos 1 agente além do `main` para os specs destrutivos de duplicação/desativação. Os 4 agentes seed (Ana / Leo / Maya / Sofia) cobrem o cenário esperado.

## Executando

```bash
# Smoke tests (read-only, seguros para qualquer ambiente):
pnpm test:e2e

# Inclui specs destrutivos (criam/editam/deletam agentes reais):
E2E_DESTRUCTIVE=1 pnpm test:e2e

# Apontando para outro host:
PLAYWRIGHT_BASE_URL=https://staging.exemplo.com pnpm test:e2e

# UI interativa:
pnpm test:e2e:ui

# Abrir relatório HTML do último run:
pnpm test:e2e:report
```

## O que está coberto

| Spec                                       | Tipo        | Cobre |
|--------------------------------------------|-------------|---|
| `agent-editor/navigation.spec.ts`          | read-only   | Checklist 5 etapas, URL sync com `?tab=`, máscaras de path/JID, header com botões Versões e Chat de teste, filtros da sidebar |
| `agent-editor/chat-drawer.spec.ts`         | read-only   | Abre/fecha drawer, alterna largura, Esc fecha |
| `agent-editor/versions.spec.ts`            | read-only ★ | Drawer com estado vazio; restauração via fixture localStorage |
| `agent-editor/wizard.spec.ts`              | destrutivo  | Criar Atendente em <60s; bloqueio de ID duplicado |
| `agent-editor/save-bar.spec.ts`            | destrutivo  | Dirty tracking; atalho Ctrl+S |
| `agent-editor/deactivate.spec.ts`          | destrutivo  | Modal com impacto; cancelar não muta estado |

★ A maior parte do spec de versões usa fixtures de `localStorage`, então roda sem efeitos colaterais. O subcaso destrutivo restaura uma versão real via UI.

## Convenções

- Tests usam o fixture `editor` exportado de `fixtures.ts`, que pré-navega para `/agent/editor` e aguarda a página estabilizar.
- Tests destrutivos usam o helper `destructive(name, fn)`. Ele faz `test.skip` quando `E2E_DESTRUCTIVE!=1`.
- Locators preferem **roles + nomes acessíveis** (compatível com os labels que o P0–P3 já garantiram).

## Limites conhecidos

- Não há gestão automática de fixtures de banco no momento — testes destrutivos assumem que o operador aceitará lixo residual (ex.: `e2e-atendente-12345`). Limpe via UI ou rode contra um workspace efêmero.
- Login não é automatizado: rode `playwright codegen` ou cookies pré-configurados se for executar em CI headless.
- Playwright pré-instalado (`pnpm exec playwright install chromium`) deve ser executado uma vez por máquina.
