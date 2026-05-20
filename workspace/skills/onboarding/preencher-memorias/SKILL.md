---
name: preencher-memorias
description: Traduzir respostas livres do dono em entradas estruturadas nas memórias (empresa.md, faq.md, canais-autorizados.md). Sub-skill usada por cadastrar-empresa.
visibility: internal
---

# Preencher Memórias

## Mapeamento resposta → memória

### empresa.md (sempre)

Formato linha a linha: `Campo: valor`

| Resposta do dono | Campo em empresa.md |
|------------------|---------------------|
| Nome do negócio | `Nome:` |
| Segmento | `Segmento:` |
| Descrição em uma frase | `Descrição:` |
| Lista de produtos/serviços | `Produtos ou serviços:` |
| Onde atende | `Endereço:` e/ou `Regiões atendidas:` |
| Horário | `Horário:` |
| WhatsApp | `WhatsApp:` |
| Quando chamar humano | `Quando chamar humano:` |
| Não inventar | `Informações que nunca podem ser inventadas:` |
| Instagram | `Instagram:` |
| Site | `Site:` |
| Pagamento | `Formas de pagamento:` |
| Pode falar preço | `Pode falar preço:` (sim/não) |
| Faixa de preço | `Faixa de preço:` |

Ao final, atualizar:
```
Status da informação: validado
```

### canais-autorizados.md (quando o dono cita WhatsApp)

Adicionar o número informado como canal interno autorizado pro Rafael:

```
- Rafael: +55XXXXXXXXX (WhatsApp do dono — autorizado em [data])
```

### faq.md (quando o dono responde dúvidas frequentes espontaneamente)

Se durante a conversa o dono mencionar dúvida comum dos clientes ("sempre perguntam X, a resposta é Y"), salvar como:

```
## [Pergunta natural do cliente]
**Resposta oficial:** [resposta do dono, na mesma linguagem]
**Fonte:** Sofia / onboarding em [data]
```

### clientes.md (perfil do público)

Quando o dono descrever o público-alvo, adicionar bloco:

```
## Perfil do público
[descrição livre do dono, primeira pessoa preservada]
Fonte: Sofia / onboarding em [data]
```

## Regras de escrita

- **Preservar as palavras do dono** quando fizer sentido — não normalizar pra linguagem corporativa.
- **Não usar aspas duplas no markdown** quando puder usar texto livre.
- **Datar tudo** com a data da entrevista (formato YYYY-MM-DD).
- **Não sobrescrever** campos já preenchidos sem confirmar com o dono ("você já tinha respondido X aqui, quer atualizar pra [novo]?").

## Verificação final

Antes de marcar `Status da informação: validado`, conferir que todos os campos obrigatórios têm valor:

- Nome
- Segmento
- Descrição
- Produtos ou serviços
- Horário
- WhatsApp
- Quando chamar humano
- Informações que nunca podem ser inventadas

Se algum estiver vazio, mantém como "pendente de validação" e avisa o dono que falta completar.
