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
- `/api/launcher/ui-visibility` agora lê o arquivo da raiz do tenant e,
  em checkout local, cai para `workspace/ui-visibility.json`, mantendo a
  mesma precedência do volume provisionado.
- `/api/whatsapp/chats`, `/api/whatsapp/reports` e o stream de eventos
  agora retornam fallback explícito quando o gateway local não expõe
  `whatsapp_native/inbox`; o painel deixa de quebrar em `404` e mostra
  estado indisponível/zerado.
- O wizard `/admin/tenants/new` não consulta mais
  `/api/admin/saas/launcher-profiles` antes do usuário escolher o tipo de
  tenant, removendo o `403` prematuro do primeiro passo.
- A documentação do fluxo público foi atualizada: o bridge
  Sofia→Catarina não é mais "planejado"; ele roda via cron workspace
  `onboarding-bridge-sofia-catarina`.

## Pendências antes de produção

1. **Criar tenant público real em staging/prod e validar o fluxo vivo.**
   O caminho correto é criar pelo wizard `Novo tenant` com
   `tenant_type=publico`, abrir o subdomínio do tenant e validar Sofia pelo
   chat real `/pico/ws`. Não usar a rota pública antiga nem a rota SSE
   legada.

2. **Habilitar e testar criação real pelo proxy SaaS admin.**
   O primeiro passo do wizard não chama mais o proxy antes da hora, mas a
   criação de tenant ainda precisa de `PICOCLAW_SAAS_ADMIN_MODE=true`,
   `PICOCLAW_SAAS_BASE_URL` e credenciais reais do controlplane em
   staging/prod.

3. **Confirmar materialização de `ui-visibility.json` no tenant criado.**
   O local agora cai para `workspace/ui-visibility.json`, mas produção
   ainda precisa validar que o provisioner escreve o arquivo na raiz do
   volume e aplica `active_profile=public` no tenant público.

4. **Validar WhatsApp real ponta a ponta.**
   O painel local agora recebe fallback quando o inbox nativo está
   indisponível, mas produção precisa confirmar envio real da Catarina,
   resposta do lead, consumo por Catarina e relatório do inbox com dados
   reais do sidecar/gateway.

5. **Validar estado real de prontidão do tenant.**
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
