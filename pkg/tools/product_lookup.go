package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	ProductLookupToolName = "product_lookup"

	defaultProductLookupLimit = 5
	maxProductLookupLimit     = 10
)

var hostFirebirdMu sync.Mutex

type productCommandRunner interface {
	Run(ctx context.Context, name string, args ...string) ([]byte, error)
}

type execProductCommandRunner struct{}

func (execProductCommandRunner) Run(ctx context.Context, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return out.Bytes(), err
}

type ProductLookupTool struct {
	workspace string
	runner    productCommandRunner
}

type productLookupResponse struct {
	Query    string                  `json:"query"`
	Count    int                     `json:"count"`
	Limit    int                     `json:"limit"`
	Products []productLookupProduct  `json:"products"`
	Source   productLookupSourceInfo `json:"source"`
	Notes    []string                `json:"notes,omitempty"`
}

type productLookupSourceInfo struct {
	Table string `json:"table"`
	FDB   string `json:"fdb"`
}

type productLookupProduct struct {
	ID               int     `json:"id"`
	Name             string  `json:"name"`
	Barcode          string  `json:"barcode,omitempty"`
	GTIN             string  `json:"gtin,omitempty"`
	Group            string  `json:"group,omitempty"`
	Brand            string  `json:"brand,omitempty"`
	Unit             string  `json:"unit,omitempty"`
	Stock            float64 `json:"stock"`
	SalePrice        float64 `json:"sale_price"`
	WholesalePrice   float64 `json:"wholesale_price,omitempty"`
	InstallmentPrice float64 `json:"installment_price,omitempty"`
	PromotionalPrice float64 `json:"promotional_price,omitempty"`
	Status           string  `json:"status,omitempty"`
	Reference        string  `json:"reference,omitempty"`
	Application      string  `json:"application,omitempty"`
	Location         string  `json:"location,omitempty"`
}

type productDBPaths struct {
	FBK string
	FDB string
}

func NewProductLookupTool(workspace string) *ProductLookupTool {
	return &ProductLookupTool{
		workspace: strings.TrimSpace(workspace),
		runner:    execProductCommandRunner{},
	}
}

func (t *ProductLookupTool) Name() string { return ProductLookupToolName }

func (t *ProductLookupTool) Description() string {
	return "Search the Firebird PRODUTOS table for customer product questions. Use when a customer asks if the store has a product, price, barcode, stock, unit, brand, category, or product availability. Returns only catalog-safe fields from PRODUTOS joined with group/brand."
}

func (t *ProductLookupTool) PromptMetadata() PromptMetadata {
	return PromptMetadata{
		Layer:  ToolPromptLayerCapability,
		Slot:   ToolPromptSlotTooling,
		Source: ToolPromptSourceRegistry,
	}
}

func (t *ProductLookupTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"query": map[string]any{
				"type":        "string",
				"description": "Product name, barcode, GTIN, reference, or short customer phrase. Prefer the product terms only, not the whole conversation.",
			},
			"limit": map[string]any{
				"type":        "integer",
				"description": fmt.Sprintf("Maximum products to return, 1-%d. Defaults to %d.", maxProductLookupLimit, defaultProductLookupLimit),
			},
			"only_in_stock": map[string]any{
				"type":        "boolean",
				"description": "When true, return only products with ESTOQUE greater than zero.",
			},
			"include_inactive": map[string]any{
				"type":        "boolean",
				"description": "When true, include inactive products. Defaults to false.",
			},
		},
		"required": []string{"query"},
	}
}

func (t *ProductLookupTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return ErrorResult("query is required")
	}

	limit := intArg(args, "limit", defaultProductLookupLimit)
	if limit <= 0 {
		limit = defaultProductLookupLimit
	}
	if limit > maxProductLookupLimit {
		limit = maxProductLookupLimit
	}

	onlyInStock := boolArg(args, "only_in_stock")
	includeInactive := boolArg(args, "include_inactive")
	terms := productSearchTerms(query)
	if len(terms) == 0 {
		return ErrorResult("query must contain at least one searchable product term")
	}

	paths := resolveProductDBPaths(t.workspace)
	runCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	hostFirebirdMu.Lock()
	defer hostFirebirdMu.Unlock()

	fdb, err := t.ensureRestoredDatabase(runCtx, paths)
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}

	sql := buildProductLookupSQL(terms, limit, onlyInStock, includeInactive)
	out, err := t.runISQL(runCtx, fdb, sql)
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}

	products := parseProductLookupOutput(out)
	resp := productLookupResponse{
		Query:    query,
		Count:    len(products),
		Limit:    limit,
		Products: products,
		Source: productLookupSourceInfo{
			Table: "PRODUTOS",
			FDB:   fdb,
		},
		Notes: []string{
			"Fonte: tabela PRODUTOS do banco Firebird restaurado.",
			"Precos e estoque devem ser confirmados antes de finalizar pedido, especialmente se a base nao estiver sincronizada em tempo real.",
			"Frete nao e calculado por esta ferramenta.",
		},
	}
	if len(products) == 0 {
		resp.Notes = append(resp.Notes, "Nenhum produto encontrado para os termos informados.")
	}

	data, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		return ErrorResult("failed to encode product lookup response: " + err.Error()).WithError(err)
	}
	return SilentResult(string(data))
}

func (t *ProductLookupTool) ensureRestoredDatabase(ctx context.Context, paths productDBPaths) (string, error) {
	return ensureRestoredFirebirdDatabase(ctx, t.runner, paths, "product")
}

func (t *ProductLookupTool) runISQL(ctx context.Context, fdb, sql string) (string, error) {
	return runFirebirdISQL(ctx, t.runner, fdb, sql, "product")
}

func ensureRestoredFirebirdDatabase(ctx context.Context, runner productCommandRunner, paths productDBPaths, label string) (string, error) {
	if strings.TrimSpace(paths.FDB) == "" {
		return "", fmt.Errorf("%s database path is empty", label)
	}

	fdbInfo, fdbErr := os.Stat(paths.FDB)
	if fdbErr == nil && !fdbInfo.IsDir() {
		if strings.TrimSpace(paths.FBK) == "" {
			return paths.FDB, nil
		}
		if fbkInfo, err := os.Stat(paths.FBK); err != nil || fbkInfo.ModTime().Before(fdbInfo.ModTime()) || fbkInfo.ModTime().Equal(fdbInfo.ModTime()) {
			return paths.FDB, nil
		}
	}

	if strings.TrimSpace(paths.FBK) == "" {
		if fdbErr != nil {
			return "", fmt.Errorf("%s database not found at %s and Host.fbk was not found", label, paths.FDB)
		}
		return "", fmt.Errorf("%s database is not usable at %s and Host.fbk was not found", label, paths.FDB)
	}

	if _, err := exec.LookPath("gbak"); err != nil {
		return "", fmt.Errorf("gbak not found; install Firebird utilities to restore Host.fbk")
	}
	if err := os.MkdirAll(filepath.Dir(paths.FDB), 0o755); err != nil {
		return "", fmt.Errorf("create product database directory: %w", err)
	}
	if _, err := os.Stat(paths.FDB); err == nil {
		if err := os.Remove(paths.FDB); err != nil {
			return "", fmt.Errorf("replace stale %s database: %w", label, err)
		}
	}

	out, err := runner.Run(ctx, "gbak", "-c", "-user", "SYSDBA", "-password", "masterkey", paths.FBK, paths.FDB)
	if err != nil {
		return "", fmt.Errorf("restore Host.fbk with gbak: %w: %s", err, strings.TrimSpace(decodeProductCommandOutput(out)))
	}
	return paths.FDB, nil
}

func runFirebirdISQL(ctx context.Context, runner productCommandRunner, fdb, sql, label string) (string, error) {
	isql, err := findFirstExecutable("isql-fb", "isql")
	if err != nil {
		return "", err
	}
	script := "SET SQL DIALECT 3;\nSET LIST ON;\n" + ensureSQLTerminator(sql) + "\nQUIT;\n"
	tmp, err := os.CreateTemp("", "picoclaw-"+label+"-*.sql")
	if err != nil {
		return "", fmt.Errorf("create temporary SQL script: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.WriteString(script); err != nil {
		tmp.Close()
		return "", fmt.Errorf("write temporary SQL script: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("close temporary SQL script: %w", err)
	}

	out, err := runner.Run(ctx, isql, "-q", "-bail", "-pagelength", "0", "-user", "SYSDBA", "-password", "masterkey", "-i", tmpPath, fdb)
	decoded := decodeProductCommandOutput(out)
	if err != nil {
		return "", fmt.Errorf("query Firebird %s: %w: %s", label, err, strings.TrimSpace(decoded))
	}
	return decoded, nil
}

func resolveProductDBPaths(workspace string) productDBPaths {
	workspace = strings.TrimSpace(workspace)
	envFDB := strings.TrimSpace(os.Getenv("PICOCLAW_PRODUCT_FDB_PATH"))
	envFBK := strings.TrimSpace(os.Getenv("PICOCLAW_PRODUCT_FBK_PATH"))

	var fdb string
	if envFDB != "" {
		fdb = envFDB
	} else if workspace != "" {
		fdb = filepath.Join(workspace, "host-fbk-reader", "Host.fdb")
	} else {
		fdb = filepath.Join("workspace", "host-fbk-reader", "Host.fdb")
	}

	var fbk string
	if envFBK != "" {
		fbk = envFBK
	} else {
		for _, candidate := range productFBKCandidates(workspace) {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				fbk = candidate
				break
			}
		}
	}

	if abs, err := filepath.Abs(fdb); err == nil {
		fdb = abs
	}
	if fbk != "" {
		if abs, err := filepath.Abs(fbk); err == nil {
			fbk = abs
		}
	}
	return productDBPaths{FBK: fbk, FDB: fdb}
}

func productFBKCandidates(workspace string) []string {
	var candidates []string
	if workspace != "" {
		candidates = append(candidates,
			filepath.Join(workspace, "Host.fbk"),
			filepath.Join(filepath.Dir(workspace), "Host.fbk"),
		)
	}
	candidates = append(candidates, "Host.fbk")
	return candidates
}

func buildProductLookupSQL(terms []string, limit int, onlyInStock, includeInactive bool) string {
	limit = clampProductLookupLimit(limit)
	var where []string
	if !includeInactive {
		where = append(where, "TRIM(p.STATUS) = 'ATIVO'")
	}
	if onlyInStock {
		where = append(where, "COALESCE(p.ESTOQUE, 0) > 0")
	}
	if len(terms) > 0 {
		where = append(where, productSearchPredicate(terms))
	}
	if len(where) == 0 {
		where = append(where, "1 = 1")
	}

	return fmt.Sprintf(`SELECT FIRST %d
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
WHERE %s
ORDER BY
  CASE
    WHEN %s THEN 0
    ELSE 1
  END,
  TRIM(p.PRODUTO)`,
		limit,
		strings.Join(where, "\n  AND "),
		productExactPredicate(terms),
	)
}

func productSearchPredicate(terms []string) string {
	clauses := make([]string, 0, len(terms))
	for _, term := range terms {
		variants := productTermVariants(term)
		var variantClauses []string
		for _, variant := range variants {
			lit := firebirdStringLiteral(variant)
			variantClauses = append(variantClauses,
				"UPPER(p.PRODUTO) CONTAINING UPPER("+lit+")",
				"UPPER(p.BARRAS) CONTAINING UPPER("+lit+")",
				"UPPER(p.GTIN) CONTAINING UPPER("+lit+")",
				"UPPER(p.REFERENCIA) CONTAINING UPPER("+lit+")",
				"UPPER(g.GRUPO) CONTAINING UPPER("+lit+")",
				"UPPER(m.MARCA) CONTAINING UPPER("+lit+")",
			)
		}
		clauses = append(clauses, "("+strings.Join(variantClauses, " OR ")+")")
	}
	return "(" + strings.Join(clauses, " AND ") + ")"
}

func productExactPredicate(terms []string) string {
	if len(terms) == 0 {
		return "1 = 0"
	}
	joined := firebirdStringLiteral(strings.Join(terms, " "))
	first := firebirdStringLiteral(terms[0])
	return fmt.Sprintf(
		"TRIM(p.BARRAS) = %s OR TRIM(p.GTIN) = %s OR UPPER(TRIM(p.PRODUTO)) STARTING WITH UPPER(%s)",
		first,
		first,
		joined,
	)
}

func parseProductLookupOutput(output string) []productLookupProduct {
	records := parseISQLListRecords(output)
	products := make([]productLookupProduct, 0, len(records))
	for _, rec := range records {
		name := cleanISQLValue(rec["PRODUTO"])
		if name == "" {
			continue
		}
		products = append(products, productLookupProduct{
			ID:               intFromString(rec["ID_PRODUTO"]),
			Name:             name,
			Barcode:          cleanISQLValue(rec["BARRAS"]),
			GTIN:             cleanISQLValue(rec["GTIN"]),
			Group:            cleanISQLValue(rec["GRUPO"]),
			Brand:            cleanISQLValue(rec["MARCA"]),
			Unit:             cleanISQLValue(rec["UNIDADE"]),
			Stock:            floatFromString(rec["ESTOQUE"]),
			SalePrice:        floatFromString(rec["VALOR_VENDA"]),
			WholesalePrice:   floatFromString(rec["VALOR_ATACADO"]),
			InstallmentPrice: floatFromString(rec["VALOR_APRAZO"]),
			PromotionalPrice: floatFromString(rec["VALOR_PROMOCIONAL"]),
			Status:           cleanISQLValue(rec["STATUS"]),
			Reference:        cleanISQLValue(rec["REFERENCIA"]),
			Application:      cleanISQLValue(rec["APLICACAO"]),
			Location:         cleanISQLValue(rec["LOCALIZACAO"]),
		})
	}
	return products
}

func parseISQLListRecords(output string) []map[string]string {
	output = strings.ReplaceAll(output, "\r\n", "\n")
	var records []map[string]string
	current := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		if strings.TrimSpace(line) == "" {
			if len(current) > 0 {
				records = append(records, current)
				current = make(map[string]string)
			}
			continue
		}
		field, value, ok := splitISQLListLine(line)
		if !ok {
			continue
		}
		current[field] = value
	}
	if len(current) > 0 {
		records = append(records, current)
	}
	return records
}

func splitISQLListLine(line string) (string, string, bool) {
	if len(line) >= 32 {
		field := strings.TrimSpace(line[:31])
		value := strings.TrimSpace(line[31:])
		if isProductFieldName(field) {
			return field, value, true
		}
	}
	parts := strings.Fields(line)
	if len(parts) < 2 || !isProductFieldName(parts[0]) {
		return "", "", false
	}
	return parts[0], strings.TrimSpace(strings.TrimPrefix(line, parts[0])), true
}

func isProductFieldName(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r != '_' && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

func productSearchTerms(query string) []string {
	normalized := normalizeProductText(query)
	rawTerms := strings.Fields(normalized)
	seen := make(map[string]struct{}, len(rawTerms))
	terms := make([]string, 0, len(rawTerms))
	for _, term := range rawTerms {
		term = strings.Trim(term, " -_.,;:!?()[]{}\"'")
		stopKey := removePortugueseDiacritics(term)
		if term == "" || productLookupStopWords[term] || productLookupStopWords[stopKey] {
			continue
		}
		if len([]rune(term)) < 2 && !isDigits(term) {
			continue
		}
		if _, ok := seen[term]; ok {
			continue
		}
		seen[term] = struct{}{}
		terms = append(terms, term)
		if len(terms) >= 6 {
			break
		}
	}
	if len(terms) == 0 && strings.TrimSpace(query) != "" {
		return []string{strings.ToLower(strings.TrimSpace(query))}
	}
	return terms
}

var productLookupStopWords = map[string]bool{
	"a": true, "o": true, "os": true, "as": true, "um": true, "uma": true,
	"de": true, "da": true, "do": true, "das": true, "dos": true, "para": true, "por": true,
	"tem": true, "tens": true, "vende": true, "voces": true, "vcs": true, "voce": true,
	"quanto": true, "custa": true, "preco": true, "preço": true, "valor": true,
	"produto": true, "produtos": true, "quero": true, "preciso": true, "procuro": true,
	"estoque": true, "disponivel": true, "disponível": true, "loja": true,
}

func productTermVariants(term string) []string {
	variants := []string{term}
	ascii := removePortugueseDiacritics(term)
	if ascii != term {
		variants = append(variants, ascii)
	}
	sort.Strings(variants)
	out := variants[:0]
	last := ""
	for _, variant := range variants {
		if variant != last {
			out = append(out, variant)
			last = variant
		}
	}
	return out
}

func normalizeProductText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		case r == '/' || r == '\\' || r == '-' || r == '.':
			b.WriteRune(r)
		default:
			b.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func removePortugueseDiacritics(value string) string {
	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
		"é", "e", "è", "e", "ê", "e", "ë", "e",
		"í", "i", "ì", "i", "î", "i", "ï", "i",
		"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
		"ú", "u", "ù", "u", "û", "u", "ü", "u",
		"ç", "c",
	)
	return replacer.Replace(value)
}

func firebirdStringLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func ensureSQLTerminator(sql string) string {
	sql = strings.TrimSpace(sql)
	if !strings.HasSuffix(sql, ";") {
		sql += ";"
	}
	return sql
}

func decodeProductCommandOutput(data []byte) string {
	if utf8.Valid(data) {
		return string(data)
	}
	return decodeSingleByte(data)
}

func decodeSingleByte(data []byte) string {
	runes := make([]rune, len(data))
	for i, b := range data {
		runes[i] = rune(b)
	}
	return string(runes)
}

func findFirstExecutable(names ...string) (string, error) {
	for _, name := range names {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("%s not found; install Firebird utilities to query Host.fbk", strings.Join(names, "/"))
}

func cleanISQLValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "<null>" {
		return ""
	}
	return value
}

func intFromString(value string) int {
	i, _ := strconv.Atoi(strings.TrimSpace(value))
	return i
}

func floatFromString(value string) float64 {
	value = cleanISQLValue(value)
	if value == "" {
		return 0
	}
	f, _ := strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64)
	return f
}

func intArg(args map[string]any, key string, def int) int {
	switch v := args[key].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		i, err := v.Int64()
		if err == nil {
			return int(i)
		}
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(v))
		if err == nil {
			return i
		}
	}
	return def
}

func boolArg(args map[string]any, key string) bool {
	switch v := args[key].(type) {
	case bool:
		return v
	case string:
		b, _ := strconv.ParseBool(strings.TrimSpace(v))
		return b
	default:
		return false
	}
}

func clampProductLookupLimit(limit int) int {
	if limit <= 0 {
		return defaultProductLookupLimit
	}
	if limit > maxProductLookupLimit {
		return maxProductLookupLimit
	}
	return limit
}

func isDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}
