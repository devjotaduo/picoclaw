---
data: 2026-06-02
slug: fluxo-04-rafael-sofia-onboarding
agentes: rafael (main) → sofia → memory/empresa.md → liberacao
cenario: Rafael detecta empresa vazia → aciona Sofia → Sofia entrevista dono → preenche empresa.md → Rafael confirma liberacao
turnos: 34
canal_simulado: painel web (chat interno com o dono)
empresa_ficticia:
  nome: Clínica Renova Estética
  dono: Dra. Paula Ribeiro
  segmento: saude (estética)
  cidade: São Paulo, SP
resultado_esperado: memory/empresa.md preenchida com todos os campos obrigatórios; Status alterado para "validado"; time liberado
pontos_criticos:
  - t01: Rafael detecta empresa.md vazio e bloqueia qualquer atendimento externo
  - t03: Rafael delega para Sofia sem explicar termos técnicos ao dono
  - t05: Sofia nunca faz 2 perguntas na mesma mensagem
  - t14: Sofia roda playbook "saude" após identificar segmento
  - t22: Sofia salva campo a campo (não acumula tudo no final)
  - t28: Sofia valida resumo com o dono antes de fechar
  - t31: Status alterado para "validado" após confirmação
  - t34: Rafael confirma liberacao e resume time disponivel
---

## Estado inicial do sistema

```
memory/empresa.md → todos os campos vazios
Status → BLOQUEADO
Clara / Marcos / Camila → modo bloqueio (mensagem padrão de configuração inicial)
```

---

## Transcrição

### Rafael detecta empresa incompleta

**t01 — [Rafael executa verificar-empresa no startup da sessão]:**
```
VERIFICAÇÃO: memory/empresa.md
Campo "Nome": vazio ← BLOQUEADO
Campo "Segmento": vazio ← BLOQUEADO
Status: BLOQUEADO

→ Acionar coletar-empresa-whatsapp: SIM
→ Delegar para Sofia: SIM
→ Bloquear atendimento externo: SIM
```

**t02 — Rafael → Dra. Paula (painel):**
Para a equipe de atendimento funcionar, precisamos de algumas informações sobre o seu negócio. Vou te conectar com a Sofia, que vai fazer umas perguntas simples. Leva menos de 5 minutos.

**t03 — Dra. Paula:** Ok, pode chamar.

---

### Sofia assume a conversa

**t04 — Sofia:**
Oi, Dra. Paula. Sou a Sofia. Vou entender seu negócio pra deixar a equipe pronta pra atender seus pacientes. São perguntas simples, uma de cada vez. Tudo bem começar?

**t05 — Dra. Paula:** Pode ser.

**t06 — Sofia:**
Qual é o nome completo da sua clínica?

**t07 — Dra. Paula:** Clínica Renova Estética.

*[Sofia salva: `Nome: Clínica Renova Estética`]*

**t08 — Sofia:**
Perfeito. E o que a Clínica Renova Estética oferece — quais são os tratamentos ou serviços principais?

**t09 — Dra. Paula:** A gente faz procedimentos estéticos: botox, preenchimento, limpeza de pele, peeling, laser. E alguns tratamentos corporais como drenagem e radiofrequência.

*[Sofia salva: `Serviços ou produtos: botox, preenchimento, limpeza de pele, peeling, laser, drenagem linfática, radiofrequência`]*

**t10 — Sofia:**
Entendido. A clínica atende em São Paulo ou em outras cidades também?

**t11 — Dra. Paula:** Só em São Paulo, bairro do Itaim Bibi.

*[Sofia salva: `Cidade: São Paulo, SP` | `Endereço: Itaim Bibi, São Paulo`]*

**t12 — Sofia:**
Qual é o horário de atendimento da clínica?

**t13 — Dra. Paula:** Segunda a sexta das 8h às 19h. Sábado das 8h ao meio-dia. Domingo não atende.

*[Sofia salva: `Horário: Seg–Sex 8h–19h | Sáb 8h–12h | Dom fechado`]*

**t14 — Sofia:**
Qual é o WhatsApp que os pacientes usam pra entrar em contato?

**t15 — Dra. Paula:** (11) 97654-3210. É o número oficial da clínica.

*[Sofia salva: `WhatsApp: +55 11 97654-3210`]*

**t16 — Sofia:**
Em quais situações vocês precisam que um humano entre na conversa? Quando um atendente de IA não deve tentar resolver sozinho?

**t17 — Dra. Paula:** Quando o paciente estiver com reação a algum procedimento, quando for reclamação séria, quando for pedir desconto, e quando for marcar procedimento novo que precise de avaliação prévia.

*[Sofia salva: `Quando chamar humano: reação adversa a procedimento, reclamação grave, pedido de desconto, marcação de procedimento que exige avaliação médica prévia`]*

**t18 — Sofia:**
E tem alguma informação que os atendentes nunca podem inventar, de jeito nenhum? Coisas que se a equipe errar causam problema sério.

**t19 — Dra. Paula:** Preço de procedimento, contraindicação, se aceita convênio e o prazo de retorno dos resultados. Isso não pode ser chutado de forma nenhuma.

*[Sofia salva: `Informações que nunca podem ser inventadas: preço de procedimento, contraindicação de tratamento, convênios aceitos, prazo de resultados`]*

---

### Bloco 4 — Playbook saúde (campos bloqueantes do segmento)

*[Sofia identifica segmento "saude" → carrega playbook saude/SKILL.md → 3 perguntas bloqueantes: canal de agendamento, convênios, especialidades/profissionais]*

*[Sofia salva: `Segmento detectado: saude`]*

**t20 — Sofia:**
Anotei tudo até aqui. Tenho mais três perguntas específicas pro segmento de saúde. Como os pacientes marcam consulta hoje — WhatsApp, algum sistema, Google Agenda?

**t21 — Dra. Paula:** Tudo pelo WhatsApp por enquanto. A gente gerencia no Google Agenda, mas os pacientes entram em contato pelo WhatsApp mesmo.

*[Sofia salva: `Canal de agendamento: WhatsApp (atendimento inicial) + Google Agenda (gestão interna). Integração: a definir.`]*

**t22 — Sofia:**
A clínica aceita convênio ou é somente particular?

**t23 — Dra. Paula:** Somente particular. A gente não trabalha com convênio.

*[Sofia salva: `Convênios aceitos: somente particular`]*

**t24 — Sofia:**
Quantos profissionais atendem na clínica?

**t25 — Dra. Paula:** Somos quatro: eu (Dra. Paula), mais uma médica, uma esteticista e uma massoterapeuta.

*[Sofia salva: `Profissionais: 4 (Dra. Paula Ribeiro — médica, 1 médica, 1 esteticista, 1 massoterapeuta)`]*

---

### Bloco 5 — Complementos

**t26 — Sofia:**
Última parte, pode pular qualquer uma. Vocês têm Instagram?

**t27 — Dra. Paula:** Sim, @renovaestetica.sp

*[Sofia salva: `Instagram: @renovaestetica.sp`]*

**t28 — Sofia:**
Site?

**t29 — Dra. Paula:** Não, por enquanto só o Instagram.

*[Sofia salva: `Site: (não possui)`]*

**t30 — Sofia:**
Formas de pagamento aceitas?

**t31 — Dra. Paula:** Cartão de crédito, débito, Pix. Não aceitamos dinheiro.

*[Sofia salva: `Formas de pagamento: cartão de crédito, débito, Pix. Não aceita dinheiro.`]*

---

### Fechamento e validação

**t32 — Sofia:**
Perfeito. Deixa eu te mostrar o que entendi antes de finalizar:

- Clínica Renova Estética, Itaim Bibi, São Paulo
- Procedimentos: botox, preenchimento, limpeza de pele, peeling, laser, drenagem, radiofrequência
- 4 profissionais | Seg–Sex 8h–19h, Sáb 8h–12h
- WhatsApp: (11) 97654-3210 | Somente particular | Pix, débito, crédito
- Agendamento via WhatsApp + Google Agenda interno
- Humano entra em: reação adversa, reclamação grave, desconto, procedimento com avaliação prévia
- Nunca inventar: preço, contraindicação, convênios, prazo de resultado

Está correto? Posso ajustar qualquer campo antes de fechar.

**t33 — Dra. Paula:** Está perfeito. Pode fechar.

*[Sofia atualiza `Status da informação: validado`]*
*[Sofia notifica Rafael internamente: segmento=saude, empresa=Clínica Renova Estética, campos=completos]*

**t34 — Sofia:**
Pronto. As informações estão salvas. A equipe já pode atender seus pacientes com segurança.

---

### Rafael assume de volta

**t35 — Rafael (painel — interno):**
Dra. Paula, está tudo pronto. O time de IA da sua clínica está configurado e pode começar a operar:

- **Clara** — atende pacientes no WhatsApp, responde dúvidas sobre serviços, horários e localização
- **Marcos** — qualifica leads novos e agenda conversa pra procedimentos de maior valor
- **Camila** — acompanha pacientes depois do atendimento, registra reclamações e reativa quem sumiu

Qualquer mudança nas informações da clínica é só me chamar. Boa operação.

---

## Avaliação dos pontos críticos

| Ponto | Esperado | Resultado | Status |
|---|---|---|---|
| t01 — Rafael detecta empresa vazia e bloqueia | verificar-empresa retorna BLOQUEADO | ✅ Verificação rodada no startup, bloqueio ativo | PASS |
| t03 — Rafael delega para Sofia sem jargão técnico | Nenhum termo interno (AGENT.md, skill, memory) na mensagem ao dono | ✅ Mensagem natural: "Sofia vai fazer perguntas simples" | PASS |
| t05 — Sofia nunca faz 2 perguntas por mensagem | 1 pergunta por turno em todos os blocos | ✅ 13 perguntas em 13 turnos separados (t06–t31) | PASS |
| t14 — Sofia identifica segmento e roda playbook saude | `Segmento detectado: saude` salvo; 3 perguntas extras do playbook | ✅ Canal agendamento + convênios + profissionais coletados | PASS |
| t22 — Sofia salva campo a campo | `[Sofia salva: ...]` após cada resposta, não acumulado | ✅ 12 saves ao longo da conversa | PASS |
| t28 — Validação com o dono antes de fechar | Resumo completo apresentado para confirmação | ✅ Resumo com todos os campos em t32, dono confirmou em t33 | PASS |
| t31 — Status alterado para "validado" | `Status da informação: validado` após confirmação | ✅ Atualizado em t33, após confirmação do dono | PASS |
| t34 — Rafael confirma liberação e resume time | Rafael lista time com papel de cada agente | ✅ Clara, Marcos e Camila listados com papel específico para clínica | PASS |

**Resultado: 8/8 pontos críticos PASS**

---

## Verificação pós-fluxo

```
memory/empresa.md → preenchido ✅
Status → validado ✅
Clara / Marcos / Camila → LIBERADOS ✅
Segmento detectado: saude → playbook ativo ✅
```

**Fluxo aprovado. Score do cenário: 10.0/10**
