# Área 1: Profissionais e equipe

Objetivo desta sessão: mapear **quem faz o quê** na empresa, com nome,
papel, horário e área de responsabilidade. Esse mapa é o que permite a
Clara/Camila encaminharem cliente pra pessoa certa sem inventar.

## Como abrir a sessão

Frase de abertura sugerida (adapte ao tom):

> "Hoje quero entender a equipe. Não preciso de organograma, só saber
> quem está na operação — quem o cliente acaba falando, quem decide o
> quê, e em que horário cada um cobre."

## Perguntas (uma por vez, na ordem)

1. "Quantas pessoas trabalham na empresa hoje, contando você?"
2. "Quem é o ponto principal de contato quando o cliente reclama? E
   quando o cliente quer fechar negócio?"
3. "Tem alguém que cobre horário específico — manhã, tarde, fim de
   semana? Como vocês se dividem?"
4. "Cada pessoa tem uma especialidade ou todo mundo faz um pouco de
   tudo?" (Se especialidade: "Me dá um exemplo — quem cuida de X?")
5. "Quando você não está disponível, quem responde no seu lugar?"
6. "Tem alguém que **não** pode receber certas demandas? Ex: estagiário
   que não fecha venda, recepcionista que não passa preço."
7. "Cada um tem WhatsApp próprio que o cliente usa, ou tudo passa pelo
   número da empresa?"
8. "Existe alguém terceirizado que entra em alguma ponta? (Contador,
   técnico de manutenção, designer freelancer...)"

## Aprofundamentos quando algo aparecer

- Se o dono mencionar um nome novo → "Esse(a) <nome> trabalha em que
  horário e em que área?"
- Se aparecer rotação de turno → "Como vocês fazem a passagem de turno?
  Tem grupo, planilha, conversa rápida?"
- Se aparecer alguém que sempre quebra processo ("só a Joana sabe
  fazer X") → marcar como **risco de bus factor** na pendência.

## Estrutura sugerida do `memory/profissionais.md`

```markdown
# Área: Profissionais e equipe

Última atualização: <YYYY-MM-DD>
Validado pelo dono: sim
Sessão conduzida por: Catarina

## Time atual (N pessoas)

### <Nome>
- Papel: <ex: recepcionista, vendedor, dentista>
- Horário: <ex: seg-sex 8h-12h>
- Área: <ex: atendimento e agendamento>
- Pode/Não pode: <ex: pode passar preço de particular; não pode dar desconto>
- Contato direto: <ex: WhatsApp próprio +55... | só pelo número da empresa>

### <Próximo nome>
...

## Coberturas de turno

- Manhã (8h-12h): <quem>
- Tarde (13h-18h): <quem>
- Noite/FDS: <ninguém / quem cobre / SLA realista>

## Quem decide o quê

- Fecha venda: <quem>
- Aprova desconto fora da regra: <quem>
- Recebe reclamação grave: <quem>
- Cuida de cobrança: <quem>

## Riscos identificados

- <ex: só a Joana sabe operar o sistema X — bus factor>
- <ex: ninguém cobre sábado à tarde — fila acumula>

## Pendências / a confirmar

- <ex: confirmar nome completo do contador terceirizado>
```

## Resumo pro Rafael (escrita 2)

Mande pro Rafael apenas os 3-5 bullets que a Clara/Marcos/Camila
precisam saber DIA-A-DIA. Exemplo:

```
- Equipe: 4 pessoas (Maria-recepção, João-dentista, Ana-financeiro, Pedro-aux).
- Horário: seg-sex 8h-18h. Sábado: só Maria, 8h-12h. Domingo: ninguém.
- Cobrança: só Ana (não passar pra mais ninguém).
- Reclamação grave: escalar pro João direto.
- Quem fecha desconto fora da regra: João (dentista, dono).
```

Não mande a lista completa de profissionais com biografia — só o que
afeta o atendimento do dia.
