---
name: detectar-pii
description: Detecta dados pessoais sensíveis (CPF, RG, cartão, chave Pix, senha) em mensagens recebidas e age conforme política de privacidade. Usar antes de salvar qualquer dado do cliente na memória.
visibility: global
---

# Skill: Detectar PII

## Objetivo
Identificar dados pessoais sensíveis em mensagens do cliente e agir com segurança.

## Quando usar
- Antes de salvar qualquer texto na memória.
- Quando o cliente enviar sequência numérica longa (pode ser CPF, cartão).
- Quando o cliente enviar imagem de documento.
- Quando o cliente mencionar senha, código ou token.

## Padrões a identificar

| Tipo | Padrão |
|---|---|
| CPF | xxx.xxx.xxx-xx ou 11 dígitos numéricos |
| CNPJ | xx.xxx.xxx/xxxx-xx |
| RG | 7-9 dígitos com ou sem pontuação |
| Cartão | 13-16 dígitos (agrupados ou contínuos) |
| Chave Pix aleatória | String alfanumérica de 32 caracteres |
| Senha ou código | Palavras "senha", "código", "token", "verificação" seguidas de números |

## Processo
1. Verificar se a mensagem contém algum padrão acima.
2. Se encontrar PII sensível:
   - NÃO repetir o dado na resposta.
   - NÃO salvar o dado bruto na memória.
   - Registrar apenas o tipo (ex: "cliente enviou CPF") sem o número.
   - Usar mensagem padrão abaixo.
3. Se for imagem de documento: confirmar finalidade e encaminhar para Atendimento Humano.

## Mensagens padrão

Documento ou dado pessoal:
> "Recebi sua informação. Por segurança, vou usar apenas o necessário e não vou registrar o número completo."

Dado bancário ou chave Pix:
> "Dados de pagamento precisam ser tratados diretamente com nossa equipe. Vou encaminhar para uma pessoa confirmar."

Senha ou código:
> "Por segurança, nunca pedimos senha ou código por aqui. Se alguém pediu isso em nosso nome, avise imediatamente."

## Regras
- Nunca armazenar CPF, RG, cartão ou senha em texto bruto.
- Nunca reenviar dado sensível em grupo.
- Chamar Atendimento Humano se for necessária validação do documento.

## Saída esperada
```
tipo_pii_detectado: [CPF | RG | cartão | chave_pix | senha | nenhum]
acao_tomada: [descrição]
dado_salvo_na_memoria: não | tipo_apenas
precisa_humano: sim | não
```
