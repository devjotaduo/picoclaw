# Habilitar agente interno por WhatsApp

Agentes com `visibility: internal` (Operador, Lia, Sofia) não atendem cliente
final. Mas você pode dar acesso direto a eles via WhatsApp em duas formas:

1. **DM de um número cadastrado** — o agente responde direto quando esse
   número específico mandar mensagem.
2. **Menção em um grupo cadastrado** — o agente responde só quando for
   `@mencionado` no grupo (mensagens normais do grupo são ignoradas).

O resto do tráfego do WhatsApp continua indo pro agente principal (Ana).

## Como funciona por baixo

O orquestrador (`internal/orchestrator/orchestrator.go:652`) lê o bloco
`access` de cada agente em `config.json` e gera regras de dispatch
automaticamente:

- Cada `whatsapp_allowed_senders` vira regra
  `{channel: whatsapp, sender: <num>}` → roteamento direto.
- Cada `whatsapp_allowed_chats` que começa com `group:` vira regra
  `{channel: whatsapp, chat: <jid>, mentioned: true}` → só dispara em
  menção.

Não mexa em `agents.dispatch.rules` diretamente: regras com prefixo
`generated:` são reescritas a cada reload. Suas regras customizadas (sem
esse prefixo) são preservadas.

## Configuração

Edite `$PICOCLAW_HOME/config.json` (ou use o painel `/admin` → Internal
Agents):

```json
{
  "agents": {
    "list": [
      {
        "id": "assistente",
        "name": "Operador",
        "access": {
          "whatsapp_direct_enabled": true,
          "whatsapp_allowed_senders": [
            "whatsapp:5511988887777"
          ],
          "whatsapp_allowed_chats": [
            "group:120363012345678901@g.us"
          ]
        }
      },
      {
        "id": "marketing",
        "name": "Lia",
        "access": {
          "whatsapp_direct_enabled": true,
          "whatsapp_allowed_senders": [
            "whatsapp:5511988887777"
          ]
        }
      }
    ]
  }
}
```

Mapeamento workspace → ID canônico:

| Agente workspace | ID em `config.json` |
|---|---|
| Sofia (onboarding) | `main` (padrão da tenant pública) |
| Operador | `assistente` |
| Lia | `marketing` |
| Marcos (vendas) | `vendas` |

## Como descobrir o JID do grupo

1. Mande qualquer mensagem no grupo com o bot dentro.
2. Veja o log do canal whatsmeow:
   `docker logs tenant-<id> 2>&1 | grep -i 'group:'`
3. O JID aparece como `120363xxxxxxxxxxxx@g.us`. Use com prefixo `group:`
   no `whatsapp_allowed_chats`.

Pra DM de número individual, o formato é
`whatsapp:<DDI><DDD><numero>` sem `+`, sem espaço (só os dígitos do
número como ele aparece no `wa.me/...`).

## Validação

Depois de editar `config.json`:

```bash
# dentro do container do tenant
picoclaw gateway --validate-config
docker restart tenant-<id>
```

Ou pelo painel: **Settings → Recarregar gateway**. Sem restart o picoclaw
ainda usa as regras antigas em memória.

## Segurança

- **Nunca** habilite `whatsapp_direct_enabled` sem listar pelo menos um
  `whatsapp_allowed_senders` ou `whatsapp_allowed_chats` — senão o agente
  interno fica exposto a qualquer número.
- O número precisa ser do operador real (ex: dono da empresa, técnico
  contratado). Não cadastre número de cliente em agente interno.
- Grupo só ativa em menção justamente pra evitar que o agente comente
  conversa que não é com ele.
