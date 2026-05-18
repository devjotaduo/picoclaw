# Analise do Host.fbk para Base de Conhecimento do Agente

Backup analisado: `Host.fbk`

Observacao importante: o backup contem a data interna `Fri Feb 03 10:27:31 2023`. Para atendimento real ao cliente, precos e estoque precisam vir de uma fonte atualizada ou de sincronizacao recorrente.

## Resumo

O banco serve bem como base de conhecimento para:

- catalogo de produtos
- precos de venda
- estoque atual no momento do backup
- codigo de barras / GTIN
- unidade de venda
- grupos, marcas e categorias quando preenchidos
- formas de pagamento cadastradas
- dados publicos da loja

O banco nao tem uma base confiavel de frete/tabela de entrega para resposta automatica ao cliente. Existem campos fiscais de frete em `NFE`, mas so ha 4 notas, todas com `VALOR_FRETE = 0`, e as tabelas `MDFE_*` de frete estao vazias.

## Tabelas recomendadas

### `PRODUTOS`

Principal fonte do agente.

Contagem:

- 1.941 produtos
- 1.937 ativos
- 1.802 com estoque maior que zero
- 1.920 com preco de venda maior que zero
- preco minimo: 0
- preco maximo: 1110
- preco medio: 26.089829

Campos mais uteis:

- `ID_PRODUTO`: identificador interno
- `PRODUTO`: nome do produto
- `BARRAS` / `GTIN`: busca por codigo de barras
- `DESCRICAO_COMPLEMENTAR`: descricao longa quando preenchida
- `REFERENCIA`: referencia comercial
- `ESTOQUE`: disponibilidade
- `VALOR_VENDA`: preco principal para cliente
- `VALOR_ATACADO`: preco de atacado, se preenchido
- `VALOR_APRAZO`: preco a prazo, se preenchido
- `VALOR_PROMOCIONAL`: promocao, se preenchido
- `UNIDADE_COMECIAL`: unidade de venda
- `STATUS`: usar preferencialmente `ATIVO`
- `GRUPO`, `MARCA`, `SUBGRUPO`: chaves para enriquecimento
- `APLICACAO`, `SECAO`, `LOCALIZACAO`: uteis para busca/operacao quando preenchidos

### `PRODUTOS_GRUPO`

Boa para categorizar produtos.

Contagem:

- 69 grupos

Observacao: 1.515 produtos estao com `GRUPO = 0`/sem grupo, entao a busca nao deve depender apenas de categoria.

Campos uteis:

- `ID`
- `GRUPO`
- `DESCONTO`, somente se a regra comercial permitir expor descontos

### `PRODUTOS_MARCA`

Boa para enriquecer busca por marca.

Contagem:

- 222 marcas

Observacao: 1.795 produtos estao sem marca associada, entao marca deve ser informacao auxiliar.

Campos uteis:

- `ID`
- `MARCA`

### `UNIDADE_MEDIDA`

Boa para traduzir unidades.

Contagem:

- 38 unidades

Campos uteis:

- `SIGLA`
- `DESCRICAO_UNIDADE`
- `PODE_FRACIONAR`

### `NFCE_FORMAS_PAGAMENTO`

Melhor fonte para formas de pagamento visiveis no atendimento.

Contagem:

- 18 formas cadastradas

Formas visiveis (`VISIVEL = S`) encontradas:

- DINHEIRO
- CARTAO DE CREDITO
- CARTAO DE DEBITO
- PRAZO
- CHEQUE
- CREDITO CLIENTE
- TROCA
- PIX

Recomendacao: expor apenas formas gerais (`DINHEIRO`, `CARTAO`, `PIX`) sem prometer credito, prazo, troca ou cheque automaticamente. Essas dependem de regra da loja e cadastro do cliente.

### `EMITENTE`

Fonte dos dados publicos da loja.

Contagem:

- 1 registro

Dados encontrados:

- Fantasia: BARATEIRO DA CONSTRUCAO
- Razao social: DAIANE DOS SANTOS SANTANA LTDA
- Endereco: RUA BELO JARDIM, S/N, NOVA ESPERANCA, JUAZEIRO/BA, CEP 48916633
- Telefone: 7488033614
- Email: contabilidade.dez@hotmail.com
- Ramo: GERAL

Recomendacao: confirmar com o dono antes de expor telefone/email no agente, porque a base pode estar antiga.

## Frete e entrega

Nao ha uma tabela pronta de frete para o agente responder valor de entrega.

O que existe:

- `NFE`: campos fiscais como `VALOR_FRETE`, `TIPO_FRETE`, `ENTRG_*`
- `TRANSPORTADORA`: 1 registro, `TRANSPORTE PROPRIO`
- `MDFE_COMPONENTE_FRETE`: 0 linhas
- `MDFE_PARCELAMENTO_FRETE`: 0 linhas
- `MDFE`: 0 linhas

Resumo das NFEs:

- 4 notas
- 0 com frete maior que zero
- `TIPO_FRETE = 9` nas 4 notas

Conclusao: o agente nao deve calcular nem prometer frete com esse banco. Criar uma fonte separada de politica de entrega, por exemplo:

- bairros atendidos
- taxa por bairro/cidade
- pedido minimo para entrega gratis
- prazo medio
- regra para retirada na loja
- frase de fallback: "Para confirmar o frete, me informe bairro/cidade e um atendente valida o valor."

## Tabelas a evitar no conhecimento do agente

Evitar ingestao direta por conter dados pessoais, historico financeiro, fiscal ou operacional:

- `CLIENTES`, `CLIENTES_*`
- `USUARIO`, `USUARIO_*`
- `CONTAS_PAGAR`, `CONTAS_RECEBER`, `RECIBO_*`, `FINANCEIRO_MOV`
- `NFE`, `NFCE`, `DAV`, `PEDIDO`, `ORCAMENTO`, `COMANDA` como historico bruto
- `PARAMETROS` completo, porque contem campos de certificado, SMTP, senha e configuracoes internas

Essas tabelas podem ser consultadas pontualmente por ferramentas internas com permissao, mas nao devem virar base de conhecimento aberta do agente.

## Extrato recomendado para o agente

Usar um extrato sanitizado, nao o banco inteiro:

```sql
SELECT
  p.ID_PRODUTO,
  TRIM(p.PRODUTO) AS PRODUTO,
  TRIM(p.BARRAS) AS BARRAS,
  TRIM(p.GTIN) AS GTIN,
  TRIM(g.GRUPO) AS GRUPO,
  TRIM(m.MARCA) AS MARCA,
  TRIM(p.UNIDADE_COMECIAL) AS UNIDADE,
  p.ESTOQUE,
  p.VALOR_VENDA,
  p.VALOR_ATACADO,
  p.VALOR_APRAZO,
  p.VALOR_PROMOCIONAL,
  TRIM(p.STATUS) AS STATUS,
  TRIM(p.REFERENCIA) AS REFERENCIA,
  TRIM(p.APLICACAO) AS APLICACAO,
  TRIM(p.LOCALIZACAO) AS LOCALIZACAO
FROM PRODUTOS p
LEFT JOIN PRODUTOS_GRUPO g ON g.ID = p.GRUPO
LEFT JOIN PRODUTOS_MARCA m ON m.ID = p.MARCA
WHERE TRIM(p.STATUS) = 'ATIVO'
ORDER BY TRIM(p.PRODUTO);
```

Arquivo gerado nesta analise:

- `workspace/host-fbk-reader/kb-produtos-catalogo-enriquecido.txt`

## Comportamento recomendado do agente

O agente pode responder:

- se vende um produto
- preco atual conforme a base
- estoque/disponibilidade conforme a base
- codigo de barras quando necessario
- alternativas por nome parecido
- formas de pagamento gerais
- endereco/contato da loja, se confirmado

O agente deve evitar afirmar:

- frete exato
- prazo exato de entrega
- credito/aprazo aprovado
- disponibilidade garantida sem dizer que o estoque deve ser confirmado
- dados de clientes, vendas, notas, recibos ou historico financeiro

Resposta segura para preco/estoque:

> Encontrei esse produto na base: [produto]. Preco cadastrado: R$ X. Estoque no sistema: Y unidade(s). Como essa informacao depende de atualizacao do caixa/estoque, recomendo confirmar antes de finalizar o pedido.
