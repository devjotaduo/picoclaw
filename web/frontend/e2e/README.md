# Agent Editor — Playwright E2E

Cobertura mínima dos fluxos do refator P0–P3 (`/agent/editor`).

## Pré-requisitos

- **Launcher** rodando em `http://localhost:18800` (`make build-launcher` + serviço dev/prod local).
- **Senha do dashboard** disponível como `E2E_PASSWORD` (auto-login). Se a senha não estiver setada e o launcher exigir auth, os testes pousam na tela `/launcher-login` e falham.
- **Browsers do Playwright** instalados localmente: `pnpm exec playwright install chromium` (uma vez por máquina).

## Como rodar

```bash
# Smoke read-only contra um launcher autenticado:
E2E_PASSWORD='senha-do-dashboard' pnpm test:e2e

# Inclui specs destrutivos (criam/editam/deletam agentes reais):
E2E_PASSWORD='senha-do-dashboard' E2E_DESTRUCTIVE=1 pnpm test:e2e

# Apontando para outro host:
E2E_BASE_URL=https://staging.exemplo.com E2E_PASSWORD='...' pnpm test:e2e

# UI interativa:
pnpm test:e2e:ui

# Abrir relatório HTML do último run:
pnpm test:e2e:report
```

## Variáveis de ambiente

| Variável          | Padrão                   | Descrição                                                                                    |
| ----------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`    | `http://localhost:18800` | URL do launcher. `PLAYWRIGHT_BASE_URL` também é aceito como alias legado.                    |
| `E2E_PASSWORD`    | _(unset)_                | Senha do dashboard. Quando ausente, o setup pula login (útil para launchers sem auth).       |
| `E2E_DESTRUCTIVE` | `0`                      | Quando `1`, habilita specs que mutam agentes reais.                                          |
| `CI`              | _(unset)_                | Quando setado, Playwright faz retries 2x e o setup loga `E2E_PASSWORD` ausente como warning. |

## Autenticação automatizada

`global-setup.ts` roda uma vez antes da suíte:

1. Faz `POST /api/auth/login` usando `E2E_PASSWORD`.
2. Abre um Chromium headless, refaz o login pelo contexto do browser para capturar todos os cookies e origens.
3. Persiste o `storageState` em `e2e/.auth/launcher.json` (gitignored).

Cada spec recebe esse storage state via `use.storageState` no `playwright.config.ts` — não há login no `beforeEach`. Se o arquivo não existir (E2E_PASSWORD ausente), os testes ainda rodam com uma sessão limpa; o launcher pode então redirecionar para `/launcher-login` e os specs falham com a tela de login na captura.

Para invalidar a sessão, basta apagar `e2e/.auth/`.

## Cobertura (15 testes em 6 arquivos)

| Spec                               | Tipo        | Cobre                                                               |
| ---------------------------------- | ----------- | ------------------------------------------------------------------- |
| `agent-editor/navigation.spec.ts`  | read-only   | Checklist 5 etapas, URL sync, máscaras de path/JID, header, filtros |
| `agent-editor/chat-drawer.spec.ts` | read-only   | Abre/fecha drawer, alterna largura, Esc fecha                       |
| `agent-editor/versions.spec.ts`    | read-only ★ | Drawer com estado vazio; restauração via fixture localStorage       |
| `agent-editor/wizard.spec.ts`      | destrutivo  | Criar Atendente em <60s; bloqueio de ID duplicado                   |
| `agent-editor/save-bar.spec.ts`    | destrutivo  | Dirty tracking; atalho Ctrl+S                                       |
| `agent-editor/deactivate.spec.ts`  | destrutivo  | Modal com impacto; cancelar mantém estado                           |

★ A maior parte do spec de versões usa fixtures de `localStorage`, sem efeitos colaterais. O subcaso destrutivo restaura uma versão real via UI.

## Convenções

- Tests usam o fixture `editor` exportado de `fixtures.ts`, que pré-navega para `/agent/editor`.
- Tests destrutivos usam `destructive(name, fn)`. Skip automático quando `E2E_DESTRUCTIVE!=1`.
- Locators preferem **roles + nomes acessíveis** (compatível com os labels do P0–P3).

## CI — exemplo de GitHub Actions

```yaml
- name: Install Playwright browsers
  working-directory: web/frontend
  run: pnpm exec playwright install --with-deps chromium

- name: E2E
  working-directory: web/frontend
  env:
    E2E_BASE_URL: http://localhost:18800
    E2E_PASSWORD: ${{ secrets.PICOCLAW_E2E_PASSWORD }}
    CI: "1"
  run: pnpm test:e2e
```

Para validar destrutivos no CI, suba um launcher efêmero com workspace temporário e adicione `E2E_DESTRUCTIVE=1` ao bloco `env`.

## Limites conhecidos

- Não há gestão automática de fixtures — testes destrutivos assumem que o operador aceitará lixo residual (ex.: `e2e-atendente-12345`). Limpe via UI ou rode contra um workspace efêmero.
- O global setup tenta login mesmo quando o launcher está em modo `setup` (senha não configurada). Para esse caso, deixe `E2E_PASSWORD` vazio.
