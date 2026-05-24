# Área 2: Casos de exceção

Objetivo desta sessão: extrair os casos que **sempre quebram o processo
padrão**. São as situações que a equipe humana lida no improviso e que
o agente automatizado vai errar se não souber.

Esses casos são o que mais gera "o bot não entendeu" — vale ouro pra
Clara/Camila não cair em armadilha.

## Como abrir a sessão

Frase de abertura sugerida:

> "Hoje quero ouvir os casos chatos. Aqueles que fogem do roteiro
> normal e que você sempre precisa pensar antes de responder. Não
> preciso de muitos — 5 ou 6 já me dão muito do que registrar."

## Perguntas (uma por vez)

1. "Pensa nos últimos 30 dias. Teve algum cliente que pediu uma coisa
   fora do comum — algo que sua equipe teve que parar pra discutir?"
2. "Tem um tipo de pedido que vocês **quase sempre** recusam? Por quê?"
3. "Tem um tipo de pedido que vocês **abrem exceção** mas custa dizer
   sim? (Ex: cliente antigo pedindo desconto.)"
4. "Existe alguma palavra ou frase que, quando o cliente fala, dispara
   alarme interno? Ex: 'Procon', 'advogado', 'devolução agora'."
5. "Tem algum cenário que **só você** sabe resolver e que sua equipe
   já te passou no automático?"
6. "Cliente que reclama duas vezes da mesma coisa — qual é o protocolo?"
7. "E o oposto: cliente VIP, fiel, antigo — vocês tratam diferente
   como? Tem algum sinal que indica 'esse merece flexibilidade'?"

## Aprofundamentos

Pra cada caso que o dono trouxer, peça:

- **O gatilho** — o que o cliente fala ou faz que sinaliza o caso.
- **O que acontece hoje** — quem na equipe assume, em quanto tempo.
- **O resultado típico** — resolve, escala, perde o cliente.
- **A regra implícita** — "a gente sempre faz X porque...".

Se o dono der um caso muito vago ("às vezes acontece"), peça **um
exemplo concreto recente**. Sem exemplo, não vira regra gravável.

## Estrutura sugerida do `memory/excecoes.md`

```markdown
# Área: Casos de exceção

Última atualização: <YYYY-MM-DD>
Validado pelo dono: sim
Sessão conduzida por: Catarina

## Casos mapeados

### Caso 1: <título curto, ex: "Cliente pede desconto acima de 20%">

- **Gatilho:** o que o cliente fala/faz que sinaliza.
- **Frequência:** <baixa/média/alta>
- **Quem resolve:** <nome>
- **Protocolo atual:** <o que a equipe faz hoje, passo a passo curto>
- **Resultado típico:** <resolve / escala / negocia>
- **Regra pro agente:** <o que a Clara/Marcos deve fazer quando detectar — geralmente: encaminhar pra humano, não tentar resolver>

### Caso 2: ...

## Palavras/frases-gatilho (escalar imediatamente)

- "Procon"
- "advogado"
- "devolver dinheiro hoje"
- <adicionar as que o dono citou>

## Cliente VIP / tratamento diferenciado

- Sinais que indicam VIP: <ex: 5+ compras no último ano, indicação de Y, etc.>
- O que muda no atendimento: <ex: pular fila de aprovação, oferecer brinde, falar direto com o dono>

## Pendências / a confirmar

- <ex: pedir lista dos 10 clientes VIP atuais pra registrar>
```

## Resumo pro Rafael (escrita 2)

Foque nas regras de **escalation imediata** e nos protocolos de
recusa que a Clara/Camila precisam respeitar. Exemplo:

```
- Palavras-gatilho que escalam pra humano direto: "Procon", "advogado", "devolver hoje".
- Desconto acima de 20%: NUNCA prometer. Encaminhar pro dono (João).
- Cliente VIP (5+ compras/ano): falar direto com o dono, pular fila padrão.
- Pedido de devolução: aceitar sem briga até 7 dias; após isso, escalar.
```

Casos muito específicos (com nome de cliente, valor exato) ficam só no
arquivo local da Catarina, não viram parte da memória de atendimento
diário.
