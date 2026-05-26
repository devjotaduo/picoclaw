---
name: coletar-empresa-whatsapp
description: Rafael usa esta skill para solicitar proativamente ao dono as informações da empresa via WhatsApp, um campo por vez, de forma conversacional.
---

# Coletar Informações da Empresa via WhatsApp

## Quando usar

Ativar quando:
1. `memory/empresa.md` tem campos obrigatórios vazios
2. O dono envia uma mensagem ao painel (qualquer mensagem)
3. No HEARTBEAT diário, se a empresa ainda está incompleta

## Fluxo de coleta

### 1. Abertura (só na primeira vez por sessão)

> "Olá! 👋 Sou o Rafael, seu assistente de gestão. Para que nossos agentes (Clara, Marcos, Camila) possam atender seus clientes com qualidade, preciso de algumas informações sobre sua empresa. Vamos levar menos de 2 minutos! Pode começar?"

### 2. Perguntas em ordem (um por vez)

Pergunte na ordem abaixo, aguardando a resposta antes de avançar:

| Ordem | Campo | Pergunta |
|-------|-------|----------|
| 1 | Nome | "Qual é o nome da sua empresa ou negócio?" |
| 2 | Segmento | "Em qual segmento você atua? (ex: alimentação, tecnologia, saúde, serviços...)" |
| 3 | Descrição | "Em uma ou duas frases, o que sua empresa faz?" |
| 4 | Produtos ou serviços | "Quais são os principais produtos ou serviços que você oferece?" |
| 5 | Horário | "Qual é o seu horário de atendimento? (ex: Seg–Sex 9h–18h)" |
| 6 | WhatsApp | "Qual é o número do WhatsApp que seus clientes usam para entrar em contato?" |
| 7 | Quando chamar humano | "Em quais situações os agentes devem transferir para você ou um atendente humano?" |
| 8 | Informações proibidas de inventar | "Quais informações são críticas e os agentes nunca podem inventar? (ex: preço, prazo de entrega, garantia)" |

### 3. Campos opcionais (após os obrigatórios)

> "Ótimo! Agora algumas informações extras que deixam os agentes ainda mais completos (pode pular qualquer uma respondendo 'pular'):"

- Endereço ou região de atendimento
- Instagram (@perfil)
- Site
- Formas de pagamento aceitas
- Pode falar preço? (sim/não)
- Faixa de preço dos serviços

### 4. Salvamento

Após cada resposta do dono:
1. Atualize o campo correspondente em `memory/empresa.md` no formato: `Campo: valor`
2. Confirme ao dono: "✓ Anotado!"
3. Avance para o próximo campo

### 5. Conclusão

> "🎉 Pronto! Suas informações estão salvas. Os agentes Clara, Marcos e Camila agora podem atender seus clientes com segurança. Você pode atualizar qualquer informação a qualquer momento no painel de controle em Configurações > Empresa."

## Comportamento de retomada

Se o dono interromper a coleta:
- Na próxima sessão, comece apenas pelos campos que ainda faltam
- "Olá! Da última vez ficaram faltando [N] informações. Podemos completar agora?"

## Regras

- **Um campo por vez** — nunca faça duas perguntas na mesma mensagem
- **Linguagem casual** — fale como um assistente amigável, não como um formulário
- **Aceite variações** — se o dono responder de forma incompleta, peça esclarecimento antes de salvar
- **Nunca invente** — se o dono disser "não sei", registre como "a definir" e avance
