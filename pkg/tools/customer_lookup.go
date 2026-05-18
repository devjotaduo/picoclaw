package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
)

const (
	CustomerLookupToolName = "customer_lookup"

	defaultCustomerLookupLimit = 5
	maxCustomerLookupLimit     = 10
)

type CustomerLookupTool struct {
	workspace string
	runner    productCommandRunner
}

type customerLookupResponse struct {
	Query             string                    `json:"query,omitempty"`
	UsedContextPhone  bool                      `json:"used_context_phone"`
	ContextPhoneLast4 string                    `json:"context_phone_last4,omitempty"`
	Count             int                       `json:"count"`
	Limit             int                       `json:"limit"`
	Customers         []customerLookupCustomer  `json:"customers"`
	Source            customerLookupSourceInfo  `json:"source"`
	Notes             []string                  `json:"notes,omitempty"`
	SearchDiagnostics customerLookupDiagnostics `json:"search_diagnostics,omitempty"`
}

type customerLookupSourceInfo struct {
	Table string `json:"table"`
	FDB   string `json:"fdb"`
}

type customerLookupDiagnostics struct {
	NameTerms     []string `json:"name_terms,omitempty"`
	PhoneVariants []string `json:"phone_variants,omitempty"`
	DocumentLast4 string   `json:"document_last4,omitempty"`
}

type customerLookupCustomer struct {
	ID                int                    `json:"id"`
	Name              string                 `json:"name"`
	LegalName         string                 `json:"legal_name,omitempty"`
	DocumentMasked    string                 `json:"document_masked,omitempty"`
	Phone             string                 `json:"phone,omitempty"`
	Mobile            string                 `json:"mobile,omitempty"`
	Mobile2           string                 `json:"mobile2,omitempty"`
	Email             string                 `json:"email,omitempty"`
	Status            string                 `json:"status,omitempty"`
	Contact           string                 `json:"contact,omitempty"`
	Address           *customerLookupAddress `json:"address,omitempty"`
	RegisteredAt      string                 `json:"registered_at,omitempty"`
	LastMovementAt    string                 `json:"last_movement_at,omitempty"`
	SellsOnCredit     string                 `json:"sells_on_credit,omitempty"`
	Blocked           string                 `json:"blocked,omitempty"`
	CreditLimit       float64                `json:"credit_limit,omitempty"`
	CreditBalance     float64                `json:"credit_balance,omitempty"`
	ReferencePoint    string                 `json:"reference_point,omitempty"`
	NeighborhoodLocal string                 `json:"neighborhood_local,omitempty"`
}

type customerLookupAddress struct {
	Street     string `json:"street,omitempty"`
	Number     string `json:"number,omitempty"`
	Complement string `json:"complement,omitempty"`
	District   string `json:"district,omitempty"`
	City       string `json:"city,omitempty"`
	State      string `json:"state,omitempty"`
	PostalCode string `json:"postal_code,omitempty"`
}

type customerLookupCriteria struct {
	Query             string
	ContextContact    string
	ContextDigits     string
	QueryDigits       string
	NameTerms         []string
	PhoneVariants     []string
	DocumentSearch    string
	UseContextPhone   bool
	ContextPhoneLast4 string
}

func NewCustomerLookupTool(workspace string) *CustomerLookupTool {
	return &CustomerLookupTool{
		workspace: strings.TrimSpace(workspace),
		runner:    execProductCommandRunner{},
	}
}

func (t *CustomerLookupTool) Name() string { return CustomerLookupToolName }

func (t *CustomerLookupTool) Description() string {
	return "Search the Firebird CLIENTES table for internal customer identification. Use silently when the current conversation phone number, a customer name, phone, CPF/CNPJ, or registration details are needed. Do not reveal sensitive customer data unless the user is authorized and the data is necessary."
}

func (t *CustomerLookupTool) PromptMetadata() PromptMetadata {
	return PromptMetadata{
		Layer:  ToolPromptLayerCapability,
		Slot:   ToolPromptSlotTooling,
		Source: ToolPromptSourceRegistry,
	}
}

func (t *CustomerLookupTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"query": map[string]any{
				"type":        "string",
				"description": "Customer name, phone, CPF/CNPJ, or a short customer phrase. Optional when use_conversation_contact is true and the channel provides a sender phone.",
			},
			"limit": map[string]any{
				"type":        "integer",
				"description": fmt.Sprintf("Maximum customers to return, 1-%d. Defaults to %d.", maxCustomerLookupLimit, defaultCustomerLookupLimit),
			},
			"use_conversation_contact": map[string]any{
				"type":        "boolean",
				"description": "When true, search by the current sender/chat phone from the tool context. Defaults to true.",
			},
			"include_inactive": map[string]any{
				"type":        "boolean",
				"description": "When true, include inactive customers. Defaults to false.",
			},
		},
	}
}

func (t *CustomerLookupTool) Execute(ctx context.Context, args map[string]any) *ToolResult {
	query, _ := args["query"].(string)
	query = strings.TrimSpace(query)

	limit := intArg(args, "limit", defaultCustomerLookupLimit)
	if limit <= 0 {
		limit = defaultCustomerLookupLimit
	}
	if limit > maxCustomerLookupLimit {
		limit = maxCustomerLookupLimit
	}

	useConversationContact := true
	if _, ok := args["use_conversation_contact"]; ok {
		useConversationContact = boolArg(args, "use_conversation_contact")
	}
	includeInactive := boolArg(args, "include_inactive")

	contextContact := ""
	if useConversationContact {
		contextContact = firstNonEmpty(ToolSenderID(ctx), ToolChatID(ctx))
	}
	criteria := buildCustomerLookupCriteria(query, contextContact, useConversationContact)
	if !criteria.HasSearch() {
		return ErrorResult("query or conversation phone is required for customer lookup")
	}

	paths := resolveCustomerDBPaths(t.workspace)
	runCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	hostFirebirdMu.Lock()
	defer hostFirebirdMu.Unlock()

	fdb, err := ensureRestoredFirebirdDatabase(runCtx, t.runner, paths, "customer")
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}

	sql := buildCustomerLookupSQL(criteria, limit, includeInactive)
	out, err := runFirebirdISQL(runCtx, t.runner, fdb, sql, "customers")
	if err != nil {
		return ErrorResult(err.Error()).WithError(err)
	}

	customers := parseCustomerLookupOutput(out)
	resp := customerLookupResponse{
		Query:             query,
		UsedContextPhone:  criteria.UseContextPhone && criteria.ContextDigits != "",
		ContextPhoneLast4: criteria.ContextPhoneLast4,
		Count:             len(customers),
		Limit:             limit,
		Customers:         customers,
		Source: customerLookupSourceInfo{
			Table: "CLIENTES",
			FDB:   fdb,
		},
		Notes: []string{
			"Fonte: tabela CLIENTES do banco Firebird restaurado.",
			"Dados de cliente sao contexto interno; nao exponha CPF/CNPJ, endereco, limite de credito ou status financeiro sem necessidade e confirmacao.",
			"Use cidade/bairro/endereco apenas para orientar atendimento e entrega; nao prometa frete sem politica oficial.",
		},
		SearchDiagnostics: customerLookupDiagnostics{
			NameTerms:     criteria.NameTerms,
			PhoneVariants: criteria.PhoneVariants,
			DocumentLast4: lastDigits(criteria.DocumentSearch, 4),
		},
	}
	if len(customers) == 0 {
		resp.Notes = append(resp.Notes, "Nenhum cliente encontrado para os dados informados.")
	}

	data, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		return ErrorResult("failed to encode customer lookup response: " + err.Error()).WithError(err)
	}
	return SilentResult(string(data))
}

func (c customerLookupCriteria) HasSearch() bool {
	return len(c.PhoneVariants) > 0 || c.DocumentSearch != "" || len(c.NameTerms) > 0
}

func buildCustomerLookupCriteria(query, contextContact string, useContextPhone bool) customerLookupCriteria {
	contextDigits := ""
	if useContextPhone {
		contextDigits = digitsOnly(contextContact)
	}
	queryDigits := digitsOnly(query)
	criteria := customerLookupCriteria{
		Query:             strings.TrimSpace(query),
		ContextContact:    strings.TrimSpace(contextContact),
		ContextDigits:     contextDigits,
		QueryDigits:       queryDigits,
		NameTerms:         customerSearchTerms(query),
		PhoneVariants:     customerPhoneVariants(contextDigits, queryDigits),
		UseContextPhone:   useContextPhone,
		ContextPhoneLast4: lastDigits(contextDigits, 4),
	}
	if len(queryDigits) >= 5 && len(queryDigits) <= 14 {
		criteria.DocumentSearch = queryDigits
	}
	return criteria
}

func resolveCustomerDBPaths(workspace string) productDBPaths {
	workspace = strings.TrimSpace(workspace)
	envFDB := firstNonEmpty(
		strings.TrimSpace(os.Getenv("PICOCLAW_CUSTOMER_FDB_PATH")),
		strings.TrimSpace(os.Getenv("PICOCLAW_PRODUCT_FDB_PATH")),
	)
	envFBK := firstNonEmpty(
		strings.TrimSpace(os.Getenv("PICOCLAW_CUSTOMER_FBK_PATH")),
		strings.TrimSpace(os.Getenv("PICOCLAW_PRODUCT_FBK_PATH")),
	)

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

func buildCustomerLookupSQL(criteria customerLookupCriteria, limit int, includeInactive bool) string {
	limit = clampCustomerLookupLimit(limit)
	var where []string
	if !includeInactive {
		where = append(where, "TRIM(COALESCE(c.STATUS, '')) = 'ATIVO'")
	}

	searchPredicate := customerSearchPredicate(criteria)
	if searchPredicate != "" {
		where = append(where, searchPredicate)
	}
	if len(where) == 0 {
		where = append(where, "1 = 0")
	}

	return fmt.Sprintf(`SELECT FIRST %d
  c.ID_CLIENTE,
  TRIM(c.CLIENTE) AS CLIENTE,
  TRIM(c.RAZ_SOCIAL) AS RAZ_SOCIAL,
  TRIM(c.CPF_CNPJ) AS CPF_CNPJ,
  TRIM(c.FONE) AS FONE,
  TRIM(c.CELULAR) AS CELULAR,
  TRIM(c.CELULAR2) AS CELULAR2,
  TRIM(c.EMAIL) AS EMAIL,
  TRIM(c.STATUS) AS STATUS,
  TRIM(c.LOGRADOURO) AS LOGRADOURO,
  TRIM(c.NUMERO) AS NUMERO,
  TRIM(c.COMPLEMENTO) AS COMPLEMENTO,
  TRIM(c.BAIRRO) AS BAIRRO,
  TRIM(c.MUNICIPIO) AS MUNICIPIO,
  TRIM(c.UF) AS UF,
  TRIM(c.CEP) AS CEP,
  TRIM(c.PONTO_REFERENCIA) AS PONTO_REFERENCIA,
  TRIM(c.CONTATO) AS CONTATO,
  c.DT_CADASTRO,
  c.DT_ULTIMO_MOVIMENTO,
  TRIM(c.VENDE_APRAZO) AS VENDE_APRAZO,
  TRIM(c.BLOQUEADO) AS BLOQUEADO,
  c.LMTE_CREDITO,
  c.CREDITO_SALDO,
  TRIM(c.LOCALIDADE) AS LOCALIDADE
FROM CLIENTES c
WHERE %s
ORDER BY
  CASE
    WHEN %s THEN 0
    WHEN %s THEN 1
    WHEN %s THEN 2
    ELSE 3
  END,
  TRIM(c.CLIENTE)`,
		limit,
		strings.Join(where, "\n  AND "),
		customerPhoneExactPredicate(criteria.PhoneVariants),
		customerDocumentExactPredicate(criteria.DocumentSearch),
		customerNameExactPredicate(criteria.NameTerms),
	)
}

func customerSearchPredicate(criteria customerLookupCriteria) string {
	var groups []string
	if phonePredicate := customerPhonePredicate(criteria.PhoneVariants); phonePredicate != "" {
		groups = append(groups, phonePredicate)
	}
	if documentPredicate := customerDocumentPredicate(criteria.DocumentSearch); documentPredicate != "" {
		groups = append(groups, documentPredicate)
	}
	if namePredicate := customerNamePredicate(criteria.NameTerms); namePredicate != "" {
		groups = append(groups, namePredicate)
	}
	if len(groups) == 0 {
		return ""
	}
	return "(" + strings.Join(groups, " OR ") + ")"
}

func customerPhonePredicate(variants []string) string {
	if len(variants) == 0 {
		return ""
	}
	var clauses []string
	for _, expr := range customerPhoneExpressions() {
		for _, variant := range variants {
			lit := firebirdStringLiteral(variant)
			clauses = append(clauses,
				fmt.Sprintf("(%s <> '' AND (%s = %s OR %s CONTAINING %s OR %s CONTAINING %s))",
					expr, expr, lit, expr, lit, lit, expr),
			)
		}
	}
	return "(" + strings.Join(clauses, " OR ") + ")"
}

func customerDocumentPredicate(digits string) string {
	if digits == "" {
		return ""
	}
	expr := firebirdDigitsExpr("c.CPF_CNPJ")
	lit := firebirdStringLiteral(digits)
	return fmt.Sprintf("(%s <> '' AND (%s = %s OR %s CONTAINING %s OR %s CONTAINING %s))",
		expr, expr, lit, expr, lit, lit, expr)
}

func customerNamePredicate(terms []string) string {
	if len(terms) == 0 {
		return ""
	}
	clauses := make([]string, 0, len(terms))
	for _, term := range terms {
		var variantClauses []string
		for _, variant := range productTermVariants(term) {
			lit := firebirdStringLiteral(variant)
			variantClauses = append(variantClauses,
				"UPPER(c.CLIENTE) CONTAINING UPPER("+lit+")",
				"UPPER(c.RAZ_SOCIAL) CONTAINING UPPER("+lit+")",
				"UPPER(c.CONTATO) CONTAINING UPPER("+lit+")",
			)
		}
		clauses = append(clauses, "("+strings.Join(variantClauses, " OR ")+")")
	}
	return "(" + strings.Join(clauses, " AND ") + ")"
}

func customerPhoneExactPredicate(variants []string) string {
	if len(variants) == 0 {
		return "1 = 0"
	}
	var clauses []string
	for _, expr := range customerPhoneExpressions() {
		for _, variant := range variants {
			lit := firebirdStringLiteral(variant)
			clauses = append(clauses,
				fmt.Sprintf("(%s <> '' AND (%s = %s OR %s CONTAINING %s))", expr, expr, lit, lit, expr),
			)
		}
	}
	return strings.Join(clauses, " OR ")
}

func customerDocumentExactPredicate(digits string) string {
	if digits == "" {
		return "1 = 0"
	}
	expr := firebirdDigitsExpr("c.CPF_CNPJ")
	lit := firebirdStringLiteral(digits)
	return fmt.Sprintf("(%s <> '' AND (%s = %s OR %s CONTAINING %s))", expr, expr, lit, lit, expr)
}

func customerNameExactPredicate(terms []string) string {
	if len(terms) == 0 {
		return "1 = 0"
	}
	joined := firebirdStringLiteral(strings.Join(terms, " "))
	first := firebirdStringLiteral(terms[0])
	return fmt.Sprintf(
		"UPPER(TRIM(c.CLIENTE)) STARTING WITH UPPER(%s) OR UPPER(TRIM(c.RAZ_SOCIAL)) STARTING WITH UPPER(%s) OR UPPER(TRIM(c.CONTATO)) STARTING WITH UPPER(%s)",
		joined,
		joined,
		first,
	)
}

func customerPhoneExpressions() []string {
	return []string{
		firebirdDigitsExpr("c.FONE"),
		firebirdDigitsExpr("c.CELULAR"),
		firebirdDigitsExpr("c.CELULAR2"),
	}
}

func firebirdDigitsExpr(field string) string {
	expr := "TRIM(COALESCE(" + field + ", ''))"
	for _, old := range []string{" ", "-", "(", ")", "+", ".", "/", "\\"} {
		expr = "REPLACE(" + expr + ", '" + old + "', '')"
	}
	return expr
}

func parseCustomerLookupOutput(output string) []customerLookupCustomer {
	records := parseISQLListRecords(output)
	customers := make([]customerLookupCustomer, 0, len(records))
	for _, rec := range records {
		name := cleanISQLValue(rec["CLIENTE"])
		if name == "" {
			continue
		}
		customer := customerLookupCustomer{
			ID:                intFromString(rec["ID_CLIENTE"]),
			Name:              name,
			LegalName:         cleanISQLValue(rec["RAZ_SOCIAL"]),
			DocumentMasked:    maskDocument(rec["CPF_CNPJ"]),
			Phone:             cleanISQLValue(rec["FONE"]),
			Mobile:            cleanISQLValue(rec["CELULAR"]),
			Mobile2:           cleanISQLValue(rec["CELULAR2"]),
			Email:             cleanISQLValue(rec["EMAIL"]),
			Status:            cleanISQLValue(rec["STATUS"]),
			Contact:           cleanISQLValue(rec["CONTATO"]),
			RegisteredAt:      cleanISQLValue(rec["DT_CADASTRO"]),
			LastMovementAt:    cleanISQLValue(rec["DT_ULTIMO_MOVIMENTO"]),
			SellsOnCredit:     cleanISQLValue(rec["VENDE_APRAZO"]),
			Blocked:           cleanISQLValue(rec["BLOQUEADO"]),
			CreditLimit:       floatFromString(rec["LMTE_CREDITO"]),
			CreditBalance:     floatFromString(rec["CREDITO_SALDO"]),
			ReferencePoint:    cleanISQLValue(rec["PONTO_REFERENCIA"]),
			NeighborhoodLocal: cleanISQLValue(rec["LOCALIDADE"]),
		}
		if address := customerAddressFromRecord(rec); address != nil {
			customer.Address = address
		}
		customers = append(customers, customer)
	}
	return customers
}

func customerAddressFromRecord(rec map[string]string) *customerLookupAddress {
	address := &customerLookupAddress{
		Street:     cleanISQLValue(rec["LOGRADOURO"]),
		Number:     cleanISQLValue(rec["NUMERO"]),
		Complement: cleanISQLValue(rec["COMPLEMENTO"]),
		District:   cleanISQLValue(rec["BAIRRO"]),
		City:       cleanISQLValue(rec["MUNICIPIO"]),
		State:      cleanISQLValue(rec["UF"]),
		PostalCode: cleanISQLValue(rec["CEP"]),
	}
	if address.Street == "" && address.Number == "" && address.Complement == "" &&
		address.District == "" && address.City == "" && address.State == "" && address.PostalCode == "" {
		return nil
	}
	return address
}

func customerSearchTerms(query string) []string {
	normalized := normalizeProductText(query)
	rawTerms := strings.Fields(normalized)
	seen := make(map[string]struct{}, len(rawTerms))
	terms := make([]string, 0, len(rawTerms))
	for _, term := range rawTerms {
		term = strings.Trim(term, " -_.,;:!?()[]{}\"'")
		stopKey := removePortugueseDiacritics(term)
		if term == "" || customerLookupStopWords[term] || customerLookupStopWords[stopKey] {
			continue
		}
		if !containsLetter(term) || len([]rune(term)) < 2 {
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
	return terms
}

var customerLookupStopWords = map[string]bool{
	"a": true, "o": true, "os": true, "as": true, "um": true, "uma": true,
	"de": true, "da": true, "do": true, "das": true, "dos": true, "para": true, "por": true,
	"eu": true, "me": true, "meu": true, "minha": true, "sou": true, "aqui": true,
	"cliente": true, "clientes": true, "cadastro": true, "dados": true, "nome": true,
	"telefone": true, "numero": true, "número": true, "whatsapp": true, "zap": true,
	"cpf": true, "cnpj": true, "documento": true, "identifica": true, "identificar": true,
	"quero": true, "preciso": true, "consulta": true, "consultar": true,
}

func customerPhoneVariants(values ...string) []string {
	seen := map[string]struct{}{}
	var variants []string
	add := func(value string) {
		value = digitsOnly(value)
		if len(value) < 8 {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		variants = append(variants, value)
	}
	for _, value := range values {
		digits := digitsOnly(value)
		add(digits)
		if strings.HasPrefix(digits, "55") && len(digits) > 10 {
			add(strings.TrimPrefix(digits, "55"))
		}
		if len(digits) > 11 {
			add(digits[len(digits)-11:])
		}
		if len(digits) > 10 {
			add(digits[len(digits)-10:])
		}
		if len(digits) > 9 {
			add(digits[len(digits)-9:])
		}
	}
	sort.SliceStable(variants, func(i, j int) bool {
		return len(variants[i]) > len(variants[j])
	})
	return variants
}

func digitsOnly(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func containsLetter(value string) bool {
	for _, r := range value {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func maskDocument(value string) string {
	digits := digitsOnly(value)
	if digits == "" {
		return ""
	}
	if len(digits) <= 4 {
		return strings.Repeat("*", len(digits))
	}
	return strings.Repeat("*", len(digits)-4) + digits[len(digits)-4:]
}

func lastDigits(value string, n int) string {
	digits := digitsOnly(value)
	if n <= 0 || digits == "" {
		return ""
	}
	if len(digits) <= n {
		return digits
	}
	return digits[len(digits)-n:]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func clampCustomerLookupLimit(limit int) int {
	if limit <= 0 {
		return defaultCustomerLookupLimit
	}
	if limit > maxCustomerLookupLimit {
		return maxCustomerLookupLimit
	}
	return limit
}
