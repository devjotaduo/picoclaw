---
name: cadastrar-empresa
description: Conduzir o cadastro inicial completo de uma empresa nova na plataforma, de forma conversacional e amigável. Skill principal da Sofia.
visibility: internal
---

# Cadastrar Empresa

## Quando ativar

- Primeira interação do dono com a plataforma.
- `memory/empresa.md` está vazio ou marcado como "pendente de validação".
- Dono diz "quero cadastrar minha empresa", "começar do zero", "configurar".

## Fluxo

### Abertura

> "Oi! Eu sou a Sofia. Vou conversar rapidinho com você pra entender seu negócio e deixar a equipe pronta pra te ajudar. São umas perguntas simples, sem complicação. Tudo bem começar?"

Aguardar "sim", "claro", "vamos lá" ou similar antes de seguir.

### Bloco 1 — Identidade (essencial)

Use a skill `entrevistar-dono` para conduzir cada pergunta:

1. Nome do negócio
2. Segmento (com exemplos do dia a dia)
3. O que vende ou faz (descrição em 1 frase)
4. Para quem vende (público-alvo)

### Bloco 2 — Operação (essencial)

5. Onde atende (cidade, bairro, online, todo o Brasil)
6. Horário de funcionamento
7. WhatsApp principal

### Bloco 3 — Limites (essencial)

8. Em que situações chamar uma pessoa da equipe direto
9. O que a equipe nunca pode inventar nem chutar

### Bloco 4 — Específico do segmento (BLOQUEANTE, depende do tipo de negócio)

Depois do Bloco 3, **antes** de ir pros complementos, Sofia decide quais perguntas extras viram bloqueantes:

1. Chamar a skill `identificar-perfil` para confirmar porte/posicionamento.
2. Chamar a skill `decidir-bloqueios-por-segmento` para escolher o playbook.
3. Rodar o playbook correto (`playbooks/<segmento>/SKILL.md`):
   - `saude` → canal de agendamento, convênios, especialidades
   - `alimentacao` → cardápio, delivery próprio, plataformas, área, formas de pagamento
   - `varejo` → catálogo, estoque, troca, entrega
   - `servicos` → orçamento, prazo, cobrança, garantia
   - `beleza` → agendamento, serviços, profissionais, pacotes
   - `educacao` → cursos, matrícula, modalidade, certificação
   - `imobiliaria` → tipos de imóvel, regiões, agendamento de visita
   - qualquer outro → `playbooks/default/SKILL.md`
4. Gravar **obrigatoriamente** no `empresa.md`:
   ```
   Segmento detectado: <chave>
   ```
   Esse campo destrava ou bloqueia o status no painel — o backend olha pra ele para saber quais perguntas extras viraram obrigatórias.

### Bloco 5 — Complementos (opcional, perguntar se o dono estiver engajado)

10. Instagram
11. Site
12. Formas de pagamento aceitas
13. Pode falar preço? Faixa?
14. Endereço completo (se for físico)

### Fechamento

- Use `preencher-memorias` pra salvar tudo.
- Mostre o resumo pro dono confirmar (incluindo os campos do playbook):

> "Deixa eu te mostrar o que entendi: [resumo]. Tá certo? Posso ajustar qualquer coisa."

- Quando o dono confirmar **e todos os campos bloqueantes do segmento estiverem preenchidos**, atualize `Status da informação` em `empresa.md` para "validado".
- Avise: "Pronto! A equipe já tá preparada. O Rafael vai cuidar do dia a dia daqui pra frente. Qualquer mudança, é só me chamar."
- Notifique Rafael internamente com o segmento e os campos-chave.

## Regras

- Nunca avance pro próximo bloco com o anterior incompleto, exceto se o dono pedir pra pular.
- Se o dono pular um campo obrigatório do segmento, anote "a definir" — o painel vai continuar cobrando.
- `Segmento detectado:` é o campo que o backend lê para decidir o que é bloqueante. Sem ele, o painel cobra só os campos base.
- Salve a cada bloco completo — não acumule pro final.
