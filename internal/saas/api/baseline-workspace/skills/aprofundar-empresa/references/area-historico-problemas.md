# Área 4: Histórico de problemas

Objetivo desta sessão: registrar problemas que **já aconteceram** na
empresa e como foram resolvidos. Cada caso vira lição aprendida e,
quando dá, regra preventiva. Assim a Camila não reinventa a roda
quando reclamação parecida bater de novo.

Padrão por caso: situação → impacto → resolução → lição → regra
preventiva criada (se houve).

## Como abrir a sessão

Frase de abertura sugerida:

> "Hoje quero ouvir o que já deu errado. Não é caça às bruxas —
> é pra equipe não repetir. Pensa nos últimos 6 meses: reclamação
> séria, falha operacional, conflito com cliente. Não precisa de
> muitos, 4 ou 5 já me dão muito material."

## Trigger keywords pra escutar

Quando o dono usar uma dessas frases, **pare e aprofunde**:

- "uma vez aconteceu..."
- "teve um caso..."
- "esse cliente já reclamou..."
- "tivemos problema com..."
- "deu ruim quando..."
- "aprendemos do jeito difícil..."

Essas frases são ouro — sempre extraia o caso completo.

## Perguntas (uma por vez)

1. "Nos últimos 6 meses, qual foi a reclamação mais séria que vocês
   receberam? O que aconteceu?"
2. "Teve algum problema operacional que parou a empresa por um tempo
   — sistema fora do ar, fornecedor falhou, alguém faltou?"
3. "Falha técnica — algo no produto/serviço que deu errado depois
   da entrega? Como vocês descobriram?"
4. "Conflito com cliente que escalou — Procon, advogado, redes
   sociais. Aconteceu? Como vocês conduziram?"
5. "Teve algum erro interno (cobrança duplicada, agendamento
   trocado, pedido perdido) que vocês precisaram correr atrás?"
6. "Algum cliente que vocês perderam e que dói até hoje? O que
   poderia ter sido diferente?"
7. "Depois desses casos, alguma regra nova nasceu? Tipo: 'agora
   sempre confirmamos X antes de Y'?"
8. "Tem algum problema que vocês **sabem** que vai voltar a
   acontecer e que ninguém arrumou ainda?"

## Aprofundamentos

Pra cada caso, extraia os 5 elementos:

- **Situação:** o que aconteceu, em uma frase.
- **Quando:** mês/ano aproximado.
- **Impacto:** financeiro, reputacional, operacional — quanto custou.
- **Como resolveram:** passo a passo curto, quem agiu.
- **Lição:** o que aprenderam, em uma frase.
- **Regra preventiva:** existe? qual é? está sendo seguida?

Se a regra preventiva não existir, pergunte: "Faz sentido a gente
criar uma agora?" — e registra.

## Estrutura sugerida do `memory/historico.md`

```markdown
# Área: Histórico de problemas

Última atualização: <YYYY-MM-DD>
Validado pelo dono: sim
Sessão conduzida por: Catarina

## Casos registrados

### Caso 1: <título curto, ex: "Cobrança duplicada em março/26">

- **Situação:** <o que aconteceu>
- **Quando:** <mês/ano>
- **Impacto:** <ex: 3 clientes afetados, R$ 800 estornados, 1 reclamação no Reclame Aqui>
- **Como resolveram:** <passo a passo curto>
- **Lição:** <em uma frase>
- **Regra preventiva criada:** <regra concreta + se está sendo seguida>

### Caso 2: ...

## Pendências / a confirmar

- <problema conhecido que ainda não tem regra preventiva>
```

## Resumo pro Rafael (escrita 2)

Top 3 lições do período — o que a Clara/Camila precisam saber pra
não cair na mesma armadilha. Exemplo:

```
- Cobrança duplicada (mar/26): sempre confirmar com cliente antes de reprocessar Pix recusado.
- Cliente perdido por demora (abr/26): SLA de resposta a reclamação grave caiu pra 2h úteis.
- Erro de agendamento (mai/26): confirmar horário por WhatsApp 1 dia antes virou regra.
```

Após coletar, grave em `memory/historico.md` (workspace da Catarina)
E envie resumo pro Rafael via delegate.
