# Auditoria de prontidão para produção — 2026-05-29

Escopo validado no checkout `C:\Users\ruthe\Pictures\pico2\picoclaw`,
com frontend Vite em `http://127.0.0.1:5174` / `http://localhost:5174`
e backend launcher temporário em `http://localhost:18800`.

## Resultado executivo

O painel autenticado e a área de agentes estão prontos para validação
interna, mas a operação completa **tenant público → Sofia → Catarina via
WhatsApp → promoção pelo admin** ainda precisa de um smoke em staging/prod
com controlplane e sidecar WhatsApp reais. A instância local usada na
auditoria não está materializada como tenant público real.

## Validações aprovadas

- `go test -tags goolm,stdjson ./web/backend/... ./internal/saas/...`
- `pnpm -C web/frontend test`
- `pnpm -C web/frontend typecheck`
- `pnpm -C web/frontend build`
- `pnpm -C web/frontend test:e2e`
  - 9 testes read-only passaram.
  - 6 testes destrutivos ficaram pulados por `E2E_DESTRUCTIVE!=1`.
- Smoke HTTP autenticado:
  - `POST /api/auth/login` → 200
  - `GET /api/auth/status` → 200
  - `GET /api/agent-dashboard` → 200
  - `GET /api/internal-agents` → 200
  - `GET /api/workspace/onboarding-state` → 200
  - `GET /api/workspace/company-onboarding` → 200
  - `GET /api/workspace/readiness` → 200
  - `GET /api/workspace/validate-readiness` → 200
  - `GET /api/cron/jobs` → 200
- E2E manual Playwright no painel:
  - Login com email + senha.
  - `/agent/dashboard` abre em `localhost` e `127.0.0.1`.
  - Abas Overview, Agentes, Fila, Relatórios e Operação carregam.
  - Busca/filtro de agentes funciona.
  - `/admin/tenants/new` carrega e mostra o card de tenant público.

## Correções feitas nesta auditoria

- A suíte Playwright agora aceita `E2E_EMAIL` + `E2E_PASSWORD`, mantendo
  compatibilidade com launchers legados que aceitam só senha.
- `global-setup.ts` grava o `storageState` no mesmo caminho que o
  `playwright.config.ts` lê.
- Fixtures E2E do editor de agentes foram ajustadas para não falhar com
  locators ambíguos depois das mudanças recentes da UI.
- O drawer "Chat de teste" passou de `z-30` para `z-[60]`, ficando acima
  do header fixo e permitindo clicar no controle de largura.

## Bloqueadores antes de produção

1. **Criar tenant público real em staging/prod e validar o fluxo vivo.**
   O local respondeu `401`/`404` em `/api/public/chat*`, então não valida
   a entrada anônima Sofia. O caminho correto é criar pelo wizard
   `Novo tenant` com `tenant_type=publico`, não usar `/pre-cadastro`.

2. **Habilitar e testar o proxy SaaS admin.**
   `/api/admin/saas/launcher-profiles` retornou `403` porque
   `PICOCLAW_SAAS_ADMIN_MODE` não está ativo neste launcher local. Em
   staging/prod, validar `PICOCLAW_SAAS_ADMIN_MODE=true` com
   `PICOCLAW_SAAS_BASE_URL`, email e senha do controlplane.

3. **Garantir `ui-visibility.json` em todo tenant criado.**
   `/api/launcher/ui-visibility` retornou `404` no local porque o arquivo
   não existe no `$PICOCLAW_HOME`. Em produção, o workspace usado pelo
   tenant público precisa carregar esse arquivo e o provisioner precisa
   escrever `active_profile=public`.

4. **Validar WhatsApp inbox/report no gateway.**
   `/api/whatsapp/chats` e `/api/whatsapp/reports` retornaram `404`.
   O launcher só faz proxy para `/whatsapp_native/inbox/*`; o gateway
   precisa expor esses endpoints ou o painel deve esconder/explicar o
   recurso quando o canal estiver indisponível.

5. **Fechar a automação Sofia → Catarina.**
   A documentação atual ainda marca a bridge automática como planejada.
   Para produção com operação sem intervenção, Catarina precisa disparar
   a primeira mensagem institucional quando Sofia marca discovery completo,
   ou deve existir SOP explícito de acionamento manual pelo admin/Rafael.

6. **Validar estado real de prontidão do tenant.**
   `validate-readiness` retornou `ok=false` no workspace local por faltar
   `nome`, `segmento`, `contato_email` e `contato_whatsapp`. Isso é
   esperado em workspace vazio, mas produção precisa bloquear promoção
   enquanto esses dados não forem coletados por Sofia.

## Checklist final de produção

- Criar tenant público novo pelo admin.
- Abrir subdomínio público e iniciar chat com Sofia.
- Confirmar `workspace/state/onboarding.json` com discovery concluído.
- Enviar mensagem real da Catarina via WhatsApp institucional.
- Receber resposta do lead no tenant e consumir pela Catarina.
- Marcar áreas de aprofundamento e `promotion.ready=true`.
- Promover pelo admin e confirmar:
  - `is_public=false`
  - `active_profile=tenant`
  - senha inicial criada
  - email enviado
  - container recriado sem segredo institucional do WhatsApp
  - login do dono funcionando
  - painel completo disponível

