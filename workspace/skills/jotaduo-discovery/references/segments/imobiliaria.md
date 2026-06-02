# Segmento: Imobiliária / Corretagem

Use para imobiliárias (locação e venda), corretores autônomos, gestoras
de aluguel, plataformas de short-stay (Airbnb gestão).

## Vocabulário

Imóvel, locação, venda, visita, proprietário, locatário, comprador,
CRECI, contrato, vistoria, fiador, taxa de administração.

## Perguntas específicas

1. "Vocês trabalham com locação, venda, ou os dois?"
2. "Quantos imóveis em carteira? Como mantém atualizada
   (Vista, Imobi24, Auxiliar, planilha)?"
3. "Captação é por corretor próprio ou recebe lead pronto?"
4. "Como o cliente normalmente entra em contato — site, OLX, Zap
   Imóveis, WhatsApp, Instagram?"
5. "CRECI ativo? Em nome da imobiliária ou do corretor?"
6. "Política de visita — agendamento obrigatório? Quem acompanha?
   Cobra deslocamento?"
7. "Tipo de garantia aceita pra locação — fiador, seguro fiança,
   título de capitalização?"

## Dores típicas

- Lead chega pelo Zap/OLX e vai pro concorrente em <15 min se ninguém
  responde.
- Visita marcada sem confirmação — corretor vai e cliente não aparece.
- Mesma pergunta sobre o mesmo imóvel várias vezes ao dia.
- Cliente quer imóvel que não atende ao perfil — corretor perde 1h
  pra descobrir.
- Pós-locação esquecido (renovação, manutenção, reajuste).
- Carteira de imóveis sem foto/descrição decente.

## Integrações comuns

- **CRM/Carteira**: Vista, Imobi24, Auxiliar, Sistema XYZ, planilha.
- **Portais**: Zap Imóveis, OLX, VivaReal, ImovelWeb (XML feed).
- **Atendimento**: WhatsApp Business, Instagram DM, site.
- **Agenda**: Google Calendar, planilha.
- **Documento**: D4Sign, ClickSign pra contrato eletrônico.

## Time típico de agentes para imobiliária

1. **`clara`** (entra primeiro) — atende WhatsApp/IG
   sobre imóveis específicos (consulta CRM), agenda visita pré-qualificada
   (perfil, faixa de preço, prazo).
2. **`marcos`** — quando lead novo, qualifica perfil
   (renda, garantia, prazo) antes de passar pro corretor humano.
3. **`camila`** — pós-locação: aniversário de contrato,
   renovação, manutenção, indicação.

## Métricas a propor

- Tempo de resposta a lead novo (alvo: <5 min).
- % de visitas que efetivam.
- Conversão lead → contrato.
- Cliente recorrente (compra/aluga >1 imóvel).

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Disponibilidade de imóvel em região
> "Tem apartamento de 2 quartos pra alugar no bairro Centro até R$ 1500?"

**O que Clara deve fazer:** se houver integração com CRM/carteira de
imóveis (Vista/Imobi24/etc), consultar e retornar 1-3 opções com
foto/preço/contato. Se NÃO houver integração, dizer "vou checar com o
corretor e te respondo em <X min>" — NÃO inventar imóvel.
**Sinal de problema:** Clara descreveu imóvel inexistente (significa
falta integração de carteira OU faltou protocolo "redirecionar pro
corretor humano").

### Cenário 2 — Agendamento de visita
> "Quero ver esse imóvel hoje à tarde. Como faço?"

**O que Clara deve fazer:** consultar política de visita em
`memory/empresa.md` (`Canal de agendamento:` ou seção dedicada).
Confirmar agenda do corretor responsável ou abrir disponibilidade
nas próximas <X horas>. Pedir dados mínimos do interessado (nome,
telefone, perfil).
**Sinal de problema:** Clara marcou visita sem qualificar OU não soube
explicar processo (significa política de visita não cadastrada — quem
acompanha, antecedência mínima, dados que precisam).

### Cenário 3 — Garantia de locação
> "Não tenho fiador. Vocês aceitam o quê?"

**O que Clara deve fazer:** consultar tipos de garantia aceitos em
`memory/empresa.md` (campo "Tipos de garantia" ou
`Formas de pagamento:`). Listar opções (seguro fiança, título de
capitalização, depósito) e mencionar parceiros se houver.
**Sinal de problema:** Clara disse "deixa eu confirmar" pra uma das
formas mais comuns (significa política de garantia não formalizada —
precisa cadastrar opções padrão + parceiros).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
