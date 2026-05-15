---
name: query-sql
description: Executa queries SELECT em arquivos .sql carregando-os em um banco SQLite temporário. Use quando o usuário quiser consultar, explorar ou extrair dados de um arquivo SQL (dump, schema + inserts). Ativado por frases como "consulta esse sql", "query no arquivo", "o que tem nessa tabela", "leia esse dump".
argument-hint: <arquivo.sql> [query SQL]
allowed-tools: [Bash, Read]
---

# Query SQL — Consulta em Arquivo SQL

O usuário invocou esta skill com: **$ARGUMENTS**

## Fluxo de execução

### 1. Parse dos argumentos

Separe o caminho do arquivo SQL da query:

- `arquivo.sql "SELECT * FROM tabela"` → arquivo + query
- `arquivo.sql` → apenas arquivo (execute o passo 2a antes de pedir a query)

### 2. Prepare o banco temporário

```bash
DB=$(mktemp /tmp/query-sql-XXXXXX.db)
sqlite3 "$DB" < "arquivo.sql" 2>&1
```

Se o arquivo contiver sintaxe incompatível com SQLite (ENGINE=InnoDB, CHARSET, etc.), use `sed` para remover antes de carregar:

```bash
sed -E 's/ ENGINE=[A-Za-z]+//g; s/ DEFAULT CHARSET=[a-z0-9]+//g; s/ COLLATE=[a-z0-9_]+//g' arquivo.sql | sqlite3 "$DB"
```

### 2a. Se não houver query: liste as tabelas e esquemas

```bash
sqlite3 "$DB" ".tables"
sqlite3 "$DB" ".schema"
```

Apresente as tabelas disponíveis e peça ao usuário qual query deseja executar. Sugira uma query útil baseada no schema.

### 3. Execute a query

```bash
sqlite3 -header -column "$DB" "SELECT ..." 2>&1
```

- Use `-header -column` para saída tabular legível
- Se a saída tiver mais de 100 linhas, aplique `LIMIT 100` e avise o usuário
- Para queries que retornam muitas colunas, considere `-markdown` em vez de `-column`

### 4. Formate e exiba os resultados

- Converta a saída para tabela Markdown
- Mostre: número de linhas retornadas, tabelas consultadas, tempo (se relevante)
- Se zero linhas: informe e sugira verificar filtros

### 5. Limpeza obrigatória

```bash
rm -f "$DB"
```

Sempre remova o banco temporário, mesmo em caso de erro.

## Tratamento de erros

| Erro sqlite3 | Causa provável | Ação |
|---|---|---|
| `no such table` | CREATE TABLE ausente no arquivo | Verifique o schema com `.tables` |
| `Parse error near` | Sintaxe não suportada pelo SQLite | Aplique sed para remover dialect específico |
| `no such file` | Caminho errado | Peça o caminho correto |
| Resultado vazio | Filtro muito restritivo | Sugira remover cláusulas WHERE |

## Exemplos de uso

```
/query-sql dump.sql "SELECT * FROM usuarios LIMIT 10"
/query-sql schema.sql "SELECT nome, email FROM clientes WHERE ativo = 1"
/query-sql dados.sql
```
