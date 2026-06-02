# Relatório de Melhorias e Ajustes — Workspace `equipe-pme-brasil`

> **⚠️ STATUS: SUPERSEDED — 2026-06-02**
>
> Este relatório foi feito em 2026-05-20 quando o workspace tinha 5 agentes e
> 21 skills. Hoje (2026-06-02) o workspace tem **13 agentes em `config.json`**
> e **117 skills**, com dois personas-folder novos (Sofia/Catarina) e fluxos
> complexos de WhatsApp outbound que não estão descritos abaixo.
>
> Consulte a auditoria mais recente conduzida pelo
> `Workspace Quality Auditor` (custom agent em
> `.github/agents/workspace-quality-auditor.agent.md`) para o estado atual.
>
> **Itens resolvidos (completo — 2026-06-02):**
> - Personas fantasmas `pixel/doc/dev` corrigidas
> - Paths absolutos Windows zerados em `config.json` (todos os 13 agentes)
> - Agentes flat (`clara`, `marcos`, `camila`, `luna`, `transferencia-humana`)
>   migrados para padrão folder (`agents/<id>/AGENT.md` + `behavior.json`)
> - Skills `sofia` e `catarina` com frontmatter `skills:` adicionado
> - `skills:` frontmatter adicionado em `AGENT.md` raiz (Rafael, 14 skills)
> - §2.1 LGPD — campos `consentimento`, `base_legal`, `finalidade` adicionados
>   em `memory/clientes.md`, `memory/leads.md`, `memory/humano.md`
> - Habilidades LGPD `consent-lgpd` ↔ `whatsapp-lgpd-consent` com referências
>   cruzadas
> - Skills órfãs absorvidas pelo Operador (github/tmux/weather/summarize/skill-creator/agent-browser)
> - Skills de moderação criadas (`anti-fraude`, `sensitive-data-protection`, `log-sanitizer`)
>
> - IDs fantasma nos 10 arquivos de segmento (`jotaduo-discovery/references/segments/*.md`)
> - Footer de `agent-catalog.md` atualizado para folder-pattern
> - **`catarina`, `pixel`, `doc`, `dev` adicionados ao roster do `agent-catalog.md`** (2026-06-02)
> - B1+B2: XSS/path-injection em `skills/onboarding-state/scripts/state.py`
>
> **Score estimado: 9.0/10** (base: 6.8 → pós-fase-1: 7.8 → pós-fase-2: 8.5 → pós-fase-3: 9.0)
>
> **Itens de baixa prioridade (não bloqueantes):**
> - §2.2 Centralizar resposta "é IA?" em `config/tone-of-voice.md` (parcial)
> - §2.3 Acessibilidade — skill existe mas não cobre todos os agentes
> - `memory/marca.md` com campos vazios (Sofia/Lia devem solicitar ao dono no primeiro pedido de arte)

---

Data da análise: 2026-05-20
Escopo analisado: `workspace/` (AGENT.md, AGENTS.md, IDENTITY.md, SOUL.md, TOOLS.md, USER.md, HEARTBEAT.md, `agents/`, `skills/`, `config/`, `memory/`)
Perspectiva aplicada: Responsible AI (viés, acessibilidade, privacidade), arquitetura de skills (PicoClaw / progressive disclosure) e segurança operacional.

---

## 1. Visão geral

O workspace define uma equipe de 5 agentes (Rafael, Clara, Marcos, Camila, Atendimento Humano) para PMEs brasileiras, com 21 skills, regras claras de transferência humana, tom de voz, escalonamento e memória estruturada.

**Pontos fortes:**
- Identidade, papéis e limites bem definidos em PT-BR, sem emojis, sem linguagem robótica.
- Regra forte de “não inventar” e consulta obrigatória à memória.
- Transferência humana padronizada com resumo (boa prática anti-frustração).
- Skills curtas, padronizadas (`name`, `description`, Objetivo, Quando usar, Processo, Regras, Saída esperada) — facilita manutenção.
- Separação clara entre canais autorizados, escalonamento e tom de voz.
- Princípio “uma pergunta por vez” aplicado de forma consistente.

**Pontos de atenção (resumo):**
1. Lacunas de privacidade/LGPD (sem política de consentimento, retenção ou minimização explícita).
2. Falta de transparência sobre IA divergente entre arquivos (3 textos diferentes para “é IA?”).
3. Acessibilidade não tratada (WhatsApp/grupos: áudio, imagem, leitor de tela).
4. Frontmatter de skills internas sem `metadata`/`requires` (inconsistência com github/hardware/weather/tmux).
5. Bias e testes de fairness ausentes (nomes, sotaques, gírias regionais).
6. Riscos de segurança operacional: canais autorizados em texto livre, sem hash/ID; sem auditoria.
7. Sobreposição de conteúdo entre `AGENT.md`, `AGENTS.md`, `IDENTITY.md`, `SOUL.md` → custo de contexto + risco de drift.
8. Skills de operação (`agent-browser`, `tmux`, `github`, `hardware`, `weather`, `summarize`, `skill-creator`) não estão referenciadas por nenhum agente — ficam órfãs.
9. Memória sem versionamento, sem TTL e sem campo de origem padronizado.
10. Ausência de skill de moderação/conteúdo sensível, anti-phishing, e detecção de PII.

---

## 2. Achados detalhados

### 2.1 Responsible AI — Privacidade & LGPD (Alta prioridade)

| Achado | Onde | Risco | Recomendação |
|---|---|---|---|
| Nenhuma menção a LGPD, base legal ou consentimento | global | Multa, perda de confiança | Criar `config/privacy-policy.md` + skill `privacidade/consentimento` |
| `coletar-informacoes` lista nome, telefone, e-mail, empresa sem citar finalidade ou base legal | `skills/atendimento/coletar-informacoes/SKILL.md` | Coleta excessiva | Adicionar passo “explicar por que está pedindo” já existe parcialmente — formalizar com frase padrão |
| Memória sem TTL ou política de retenção | `memory/MEMORY.md` | Dados antigos viram passivo | Definir retenção por arquivo (ex.: leads=12 meses, atendimentos=24 meses) |
| `atendimentos.md`, `clientes.md`, `humano.md` sem campo de “base legal” ou “consentimento” | `memory/*` | Rastreabilidade fraca | Adicionar campos `consentimento`, `data_consentimento`, `finalidade` |
| Sem skill de “direito do titular” (acesso, correção, exclusão) | global | Não conformidade LGPD Art. 18 | Criar `skills/privacidade/direitos-do-titular/SKILL.md` |
| Sem definição de quem é o controlador/operador | `IDENTITY.md` | Indefinição legal | Adicionar bloco “Controlador de dados” em `config/company-profile.md` |

### 2.2 Responsible AI — Transparência sobre IA (Média)

Três textos diferentes para a mesma pergunta:

- `AGENTS.md` linha 17: *“Sou um assistente digital da equipe.”*
- `AGENT.md` linha 51: idem.
- `SOUL.md` linha 23: *“Sou um assistente digital da equipe, preparado para agilizar seu atendimento. Se precisar, posso encaminhar para uma pessoa.”*
- `config/tone-of-voice.md` proíbe *“Sou um assistente virtual treinado”* mas não fornece a versão oficial.

**Risco:** Inconsistência detectável pelo cliente e ambiguidade sobre divulgação de IA (boas práticas exigem disclosure honesto).

**Recomendação:** Centralizar a resposta única em `config/tone-of-voice.md` e referenciar dos demais (single source of truth). Recomendado:
> *"Sou um assistente digital da equipe. Posso encaminhar para uma pessoa quando precisar."*

### 2.3 Responsible AI — Viés e fairness (Média)

- Nenhum teste documentado com nomes regionais brasileiros (Ariranha, Maria das Graças, José da Silva, Wesley, Kauã, Maitê, Pyetra, nomes indígenas, sobrenomes árabes/japoneses comuns no Brasil).
- `classificar-lead` usa critérios subjetivos (“é decisor”) sem guardrails contra discriminação por porte/região/segmento.
- `funil-comercial` e `lead-scoring.md` não mencionam que classificação automática não pode influenciar preço/atendimento de forma discriminatória.

**Recomendação:**
- Criar `skills/qualidade/testes-de-bias/SKILL.md` com casos-teste obrigatórios antes de “publicar” a equipe.
- Adicionar regra em `SOUL.md`: *“Nenhuma classificação de lead pode alterar a qualidade do atendimento.”*
- Validar normalização de nomes com acento, hífen, apóstrofo (`D'Ávila`, `José-María`).

### 2.4 Responsible AI — Acessibilidade (Média)

O canal é WhatsApp/grupos. Não há orientação para:

- Mensagens de áudio enviadas pelo cliente (transcrição? pedir texto?).
- Imagens enviadas pelo cliente (descrição? OCR? privacidade?).
- Clientes com baixa alfabetização — frases ainda mais simples.
- Clientes idosos — pacing diferente.
- Linguagem inclusiva (deficiência, gênero).

**Recomendação:** Criar `skills/acessibilidade/atendimento-inclusivo/SKILL.md` com:
- “Se receber áudio e não puder transcrever, pedir texto educadamente.”
- “Se receber imagem com dado sensível (RG, CPF, comprovante), confirmar finalidade antes de armazenar.”
- Vocabulário máximo 6ª série quando o cliente usar frases curtas/erros ortográficos.

### 2.5 Arquitetura de skills

**(a) Frontmatter inconsistente.** Skills internas usam só `name` + `description`. Skills “externas” (`github`, `hardware`, `weather`, `tmux`, `summarize`, `agent-browser`) usam `metadata.nanobot` com `requires`/`install`. Padronizar:
- Adicionar `metadata: { nanobot: { emoji: "...", visibility: "interno|atendimento|comercial|suporte" } }` nas internas, ou
- Documentar explicitamente em `skills/README` (sem criar README dentro de cada skill, conforme `skill-creator` proíbe) por que internas não têm `requires`.

**(b) Skills órfãs.** `agent-browser`, `tmux`, `github`, `hardware`, `weather`, `summarize`, `skill-creator` não são referenciadas por nenhum agente em `AGENTS.md`. Decidir:
- Removê-las do workspace de produção, OU
- Criar agente “operador técnico” (uso interno), OU
- Mover para `skills/_internal/` e marcar `visibility: dev`.

**(c) Sobreposição de conteúdo.** `AGENT.md`, `AGENTS.md`, `IDENTITY.md`, `SOUL.md` repetem a lista de agentes, regras de “não inventar”, “não usar emoji”, “transparência”. Custo de contexto + risco de drift quando atualizar.
- **Proposta:** `IDENTITY.md` = quem somos; `SOUL.md` = como nos comportamos; `AGENTS.md` = especificação por agente; `AGENT.md` = índice/loader (apenas links). Remover duplicações.

**(d) Saídas em texto livre.** Toda “Saída esperada” é Markdown com `Campo:`. Bom para humano, ruim para integração. Adicionar versão JSON opcional ou bloco `yaml` para parsing.
Exemplo em `triagem-inicial`:
```yaml
cliente: ""
empresa: ""
contato: ""
motivo: ""
tipo: ""
urgencia: ""
lead: ""
agente_recomendado: ""
proximo_passo: ""
```

**(e) Falta skill de despedida.** Existe abertura (`triagem-inicial`) e transferência, mas não há “encerrar atendimento com próximo passo claro”. Camila tem regra *“não encerrar sem próximo passo”*, mas não há skill operacional para isso. Criar `skills/atendimento/encerrar-atendimento/SKILL.md`.

**(f) Falta skill de detecção de PII/dados sensíveis.** Crítico para grupos.

**(g) Falta skill de anti-phishing/golpe.** Cliente pode pedir “Pix antecipado”, “troca de chave Pix” — agente precisa recusar com texto pronto.

### 2.6 Segurança operacional

| Item | Atual | Recomendado |
|---|---|---|
| Canais autorizados | Lista em texto livre `memory/canais-autorizados.md` | IDs/hashes verificáveis + `config/authorized-channels.md` como código fonte; memória apenas mirror |
| Auditoria | Nenhuma | Log append-only por agente em `state/audit/YYYY-MM-DD.log` |
| Comando destrutivo | “Não executar sem autorização” | Lista enumerada de ações bloqueadas + frase padrão de recusa |
| Token/credenciais | Sem menção | `TOOLS.md` deve proibir incluir credenciais em mensagens e memória |
| Rafael proatividade | `HEARTBEAT.md` define rotina | Faltam rate-limits (ex.: máx. 1 alerta por hora por tópico) para não spammar o dono |
| `agent-browser`/`tmux` | Skills genéricas, podem agir externamente | Marcar como `requires_confirmation: true` em qualquer fluxo |

### 2.7 Memória — engenharia de dados

- Sem versionamento (Git já cobre, mas registros devem ter `data`, `autor`, `status`).
- `atualizar-memoria` define formato `Data/Fonte/Informação/Status/Agente/Observação` — bom. **Adicionar `id` único e `expira_em`.**
- `MEMORY.md` lista arquivos mas não impede que um agente leia arquivo fora da sua permissão. As permissões estão em `AGENTS.md` por agente, mas não há mecanismo declarativo. Sugerido bloco `permissions:` no frontmatter de cada agente:
```yaml
memory_read:
  - empresa.md
  - faq.md
memory_write:
  - melhorias.md
```
- `clientes.md`, `leads.md`, `humano.md` não foram exibidos — verificar se contêm template ou dados reais (se reais, remover do Git e tratar como dados pessoais).

### 2.8 Tom de voz e UX conversacional

- `tone-of-voice.md` lista “preferir/evitar” — ótimo. Faltam exemplos negativos completos (“NÃO dizer X porque…”).
- Falta orientação sobre **silêncio**: quando não responder em grupo (mensagem que não exige resposta).
- Falta orientação sobre **emergência**: cliente em crise pessoal/saúde mental — encaminhamento imediato e tom específico.
- Falta **timezone/horário comercial**: agentes podem responder fora do horário? Diferença entre auto-resposta e agente ativo?

### 2.9 Documentação e onboarding

- Não há um `workspace/README` (e pelo `skill-creator` README dentro de skill é proibido, mas no root do workspace é útil).
- `USER.md` é bom mas estático. Adicionar seção “Como adicionar um novo agente” e “Como adicionar uma nova skill”.
- `cron/`, `sessions/`, `state/`, `heartbeat.log` não documentados — criar `workspace/STRUCTURE.md`.

---

## 3. Recomendações priorizadas

### P0 — Bloqueia ir para produção
1. **Definir resposta única de transparência sobre IA** em `tone-of-voice.md` e referenciar.
2. **Criar política de privacidade/LGPD** (`config/privacy-policy.md`) + base legal + retenção por arquivo de memória.
3. **Skill de detecção e tratamento de PII** (`skills/privacidade/detectar-pii/SKILL.md`).
4. **Skill anti-fraude/anti-phishing** com texto padrão de recusa.
5. **Auditoria mínima**: append em `state/audit/*.log` por ação sensível.

### P1 — Qualidade e fairness
6. **Casos-teste de bias** com nomes regionais BR + edge cases (acentos, hífen, nomes indígenas/árabes/japoneses).
7. **Skill de acessibilidade** (áudio, imagem, baixa alfabetização, idosos).
8. **Skill de encerramento** com próximo passo claro.
9. **Centralizar definições**: eliminar duplicação `AGENT.md`/`AGENTS.md`/`IDENTITY.md`/`SOUL.md`.
10. **Padronizar frontmatter** das skills internas (visibility, requires).

### P2 — Arquitetura
11. Bloco `permissions:` declarativo no frontmatter de cada agente.
12. Saída estruturada (YAML) opcional em cada skill que produz dado.
13. Rate-limit de alertas do Rafael (`HEARTBEAT.md`).
14. Decidir destino das skills órfãs (`agent-browser`, `tmux`, `github`, `hardware`, `weather`, `summarize`).
15. `workspace/STRUCTURE.md` documentando `cron/`, `sessions/`, `state/`, `memory/`.

### P3 — Refinamentos
16. Tom para emergência/crise emocional.
17. Política de silêncio em grupo.
18. Política de horário comercial e auto-resposta fora do horário.
19. Linguagem inclusiva explícita (gênero, deficiência).
20. IDs únicos e `expira_em` em registros de memória.

---

## 4. Patches sugeridos (snippets prontos)

### 4.1 Frase única de transparência (em `config/tone-of-voice.md`)
```markdown
## Resposta padrão para "Você é uma IA?"
"Sou um assistente digital da equipe. Posso encaminhar para uma pessoa quando precisar."
Esta é a única versão aprovada. Não parafrasear.
```

### 4.2 Skill nova: `skills/privacidade/detectar-pii/SKILL.md`
```markdown
---
name: detectar-pii
description: Detecta CPF, RG, cartão, senha, chave Pix em mensagens e age conforme política.
---
# Skill: Detectar PII
## Quando usar
- Toda mensagem recebida do cliente.
- Antes de salvar qualquer texto na memória.
## Processo
1. Procurar padrões: CPF (xxx.xxx.xxx-xx), RG, cartão (16 dígitos), senha, chave Pix.
2. Se encontrar, não repetir o dado na resposta.
3. Pedir confirmação da finalidade.
4. Não salvar dado bruto na memória; salvar apenas resumo sem o número.
## Saída esperada
Tipo de PII detectado:
Ação tomada:
Pode prosseguir:
```

### 4.3 Bloco de permissões no agente (exemplo Camila)
```yaml
---
name: Camila
role: Suporte e pós-venda
visibility: suporte
memory_read: [empresa.md, faq.md, suporte.md, atendimentos.md, clientes.md]
memory_write: [suporte.md, atendimentos.md, melhorias.md]
can_call: [Atendimento Humano, Rafael]
---
```

### 4.4 Retenção em `memory/MEMORY.md`
```markdown
## Retenção
- empresa.md, faq.md: permanente (validar a cada 6 meses)
- leads.md: 12 meses sem interação → arquivar
- atendimentos.md: 24 meses → arquivar
- clientes.md: enquanto houver relação comercial + 12 meses
- humano.md: 36 meses
- Dados pessoais sensíveis: nunca persistir em texto bruto
```

### 4.5 Mensagem padrão anti-fraude
```markdown
"Por segurança, a equipe nunca pede senha, código de verificação ou Pix por aqui. Se receber esse pedido, ignore e me avise para confirmar."
```

---

## 5. Próximos passos sugeridos

1. Aplicar P0 (1–5) — estimativa: pequeno esforço, alto impacto.
2. Rodar bateria de bias (P1.6) com 20 casos antes de qualquer go-live.
3. Refatorar duplicação (P1.9) — reduzirá ~30% do contexto carregado.
4. Documentar e versionar `config/privacy-policy.md` com aprovação do dono.
5. Marcar `agent-browser`, `tmux`, `github`, `hardware`, `weather` como `visibility: dev` ou removê-las do workspace de produção.

---

## 6. Checklist Responsible AI (status atual)

- [ ] AI decisions tested with diverse inputs
- [x] All interactive elements ... (N/A para canal WhatsApp; cobrir em skill de acessibilidade)
- [ ] Images have descriptive alt text (sem política para imagem)
- [x] Error messages explain how to fix (parcial — falta padronização)
- [ ] Only essential data collected (sem política formal)
- [ ] Users can opt out of non-essential features (sem consentimento explícito)
- [x] System works without complex tech (texto puro, ok)

**Bloqueadores para produção:** privacidade/LGPD, transparência única sobre IA, detecção de PII, anti-fraude, casos-teste de bias.

---

*Relatório gerado por análise estática de Markdown. Recomenda-se validação humana antes de aplicar as mudanças P0/P1.*
