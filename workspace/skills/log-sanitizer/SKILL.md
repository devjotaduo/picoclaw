---
name: log-sanitizer
description: Mascarar dados sensíveis em logs, stack traces, screenshots e prints antes de armazenar, compartilhar ou anexar a um ticket. Ativar sempre que o usuário colar log, mensagem de erro com payload, cabeçalhos HTTP, URLs com query string, mensagens de banco ou qualquer texto que possa conter token, chave, senha, CPF, cartão, email interno, cookie de sessão ou URL com credencial.
version: 1.0.0
language: pt-br
---

# Log Sanitizer

## Princípios

- Mascarar é obrigatório antes de armazenar logs em ticket, anexo, KB ou conversa com a equipe.
- Manter a estrutura do log — só substituir o valor sensível por `[REDACTED]` ou marca equivalente.
- Quando em dúvida, mascarar. Custo de mascarar é zero; custo de vazar é alto.

## Padrões a procurar

| Tipo                              | Exemplo de padrão                                    | Substituir por                |
| --------------------------------- | ---------------------------------------------------- | ----------------------------- |
| Bearer token                      | `Authorization: Bearer eyJhbGc...`                   | `Authorization: Bearer [REDACTED]` |
| API key em header/query           | `X-API-Key: abc123...` / `?api_key=...`              | `[REDACTED]`                  |
| Cookie de sessão                  | `Cookie: session=...; csrf=...`                      | `Cookie: session=[REDACTED]`  |
| Senha em payload                  | `"password":"..."` / `password=...`                  | `"password":"[REDACTED]"`     |
| CPF                               | `123.456.789-01` ou `12345678901`                    | `***.***.***-01` (manter últimos 2) |
| Cartão                            | `1234 5678 9012 3456`                                | `**** **** **** 3456`         |
| CVV                               | `cvv=123`                                            | `cvv=[REDACTED]`              |
| Email interno corporativo         | `joao.silva@empresa.com.br` (se sensível)            | `j***@empresa.com.br`         |
| Connection string com credencial  | `postgres://user:pass@host/db`                       | `postgres://[REDACTED]@host/db` |
| URL com token                     | `https://api/x?token=...`                            | `https://api/x?token=[REDACTED]` |
| Variáveis de ambiente sensíveis   | `DATABASE_URL=...`, `SECRET=...`                     | `DATABASE_URL=[REDACTED]`     |
| JWT inteiro                       | `eyJ...` (3 partes base64 separadas por ponto)       | `[REDACTED_JWT]`              |
| Chaves SSH/PGP/TLS                | `-----BEGIN ... PRIVATE KEY-----`                    | `[REDACTED_KEY]`              |
| Dados de saúde / financeiros      | qualquer valor identificado como sensível            | `[REDACTED]`                  |

## Workflow

1. Receber o log/print do usuário.
2. Varrer linha por linha procurando os padrões acima (e variantes).
3. Substituir mantendo a estrutura — não apagar a linha inteira; manter o nome do campo para que a engenharia entenda o formato.
4. Antes de gravar, **revisar o resultado** procurando o que ficou — repetir mascaramento se necessário.
5. Anexar a versão sanitizada ao ticket/relatório. Se houver dúvida sobre algum campo, mascarar e adicionar nota "campo X mascarado por precaução".

## Exemplos

**Antes:**
```
2025-05-14 10:32:11 INFO POST /api/users 200
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Body: {"email":"joao.silva@cliente.com","password":"MinhaSenha123","cpf":"123.456.789-01"}
DATABASE_URL=postgres://admin:s3cr3t@db.internal/prod
```

**Depois:**
```
2025-05-14 10:32:11 INFO POST /api/users 200
Authorization: Bearer [REDACTED]
Body: {"email":"j***@cliente.com","password":"[REDACTED]","cpf":"***.***.***-01"}
DATABASE_URL=[REDACTED]
```

**Antes:** stack trace com `Set-Cookie: session=abc123def...; HttpOnly`
**Depois:** `Set-Cookie: session=[REDACTED]; HttpOnly`

## Encaminhamento

Encaminhar imediatamente ao time de segurança quando, ao sanitizar, detectar:
- Chave privada inteira colada em log (vazamento real — exige rotação).
- Token de produção compartilhado em canal não-seguro.
- Senha em texto claro em log de aplicação (bug de logging — abrir incidente).
- Suspeita de dados de outro cliente no log que está sendo analisado.
