package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestCustomerLookupCriteriaUsesContextPhoneAndName(t *testing.T) {
	criteria := buildCustomerLookupCriteria("sou Maria da Silva", "5511988887777@s.whatsapp.net", true)

	if !criteria.UseContextPhone {
		t.Fatal("expected criteria to use context phone")
	}
	if criteria.ContextDigits != "5511988887777" {
		t.Fatalf("ContextDigits = %q, want %q", criteria.ContextDigits, "5511988887777")
	}
	if criteria.ContextPhoneLast4 != "7777" {
		t.Fatalf("ContextPhoneLast4 = %q, want %q", criteria.ContextPhoneLast4, "7777")
	}
	wantTerms := []string{"maria", "silva"}
	if !reflect.DeepEqual(criteria.NameTerms, wantTerms) {
		t.Fatalf("NameTerms = %#v, want %#v", criteria.NameTerms, wantTerms)
	}
	for _, want := range []string{"5511988887777", "11988887777", "1988887777", "988887777"} {
		if !containsString(criteria.PhoneVariants, want) {
			t.Fatalf("PhoneVariants = %#v, missing %q", criteria.PhoneVariants, want)
		}
	}
}

func TestBuildCustomerLookupSQLEscapesAndFilters(t *testing.T) {
	criteria := customerLookupCriteria{
		NameTerms:      []string{"o'connor"},
		PhoneVariants:  []string{"554988595684", "4988595684"},
		DocumentSearch: "12345678901",
	}
	sql := buildCustomerLookupSQL(criteria, 99, false)

	for _, want := range []string{
		"SELECT FIRST 10",
		"FROM CLIENTES c",
		"TRIM(COALESCE(c.STATUS, '')) = 'ATIVO'",
		"c.CPF_CNPJ",
		"12345678901",
		"554988595684",
		"4988595684",
		"o''connor",
		"UPPER(TRIM(c.CLIENTE)) STARTING WITH UPPER('o''connor')",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("SQL missing %q:\n%s", want, sql)
		}
	}
}

func TestBuildCustomerLookupSQLCanIncludeInactive(t *testing.T) {
	criteria := customerLookupCriteria{NameTerms: []string{"maria"}}
	sql := buildCustomerLookupSQL(criteria, 2, true)
	if strings.Contains(sql, "TRIM(COALESCE(c.STATUS, '')) = 'ATIVO'") {
		t.Fatalf("SQL should not force active customers when includeInactive=true:\n%s", sql)
	}
	if !strings.Contains(sql, "SELECT FIRST 2") {
		t.Fatalf("SQL should keep requested limit:\n%s", sql)
	}
}

func TestParseCustomerLookupOutput(t *testing.T) {
	output := strings.Join([]string{
		isqlListLine("ID_CLIENTE", "12"),
		isqlListLine("CLIENTE", "MARIA DA SILVA"),
		isqlListLine("RAZ_SOCIAL", "MARIA SILVA ME"),
		isqlListLine("CPF_CNPJ", "12345678901"),
		isqlListLine("FONE", "7433334444"),
		isqlListLine("CELULAR", "74988887777"),
		isqlListLine("CELULAR2", "<null>"),
		isqlListLine("EMAIL", "maria@example.com"),
		isqlListLine("STATUS", "ATIVO"),
		isqlListLine("LOGRADOURO", "RUA A"),
		isqlListLine("NUMERO", "123"),
		isqlListLine("COMPLEMENTO", "CASA"),
		isqlListLine("BAIRRO", "CENTRO"),
		isqlListLine("MUNICIPIO", "JUAZEIRO"),
		isqlListLine("UF", "BA"),
		isqlListLine("CEP", "48900000"),
		isqlListLine("PONTO_REFERENCIA", "PERTO DA PRACA"),
		isqlListLine("CONTATO", "MARIA"),
		isqlListLine("DT_CADASTRO", "01.02.2024"),
		isqlListLine("DT_ULTIMO_MOVIMENTO", "03.04.2025 10:20:30.0000"),
		isqlListLine("VENDE_APRAZO", "SIM"),
		isqlListLine("BLOQUEADO", "NAO"),
		isqlListLine("LMTE_CREDITO", "150,50"),
		isqlListLine("CREDITO_SALDO", "25.25"),
		isqlListLine("LOCALIDADE", "CENTRO"),
		"",
	}, "\n")

	customers := parseCustomerLookupOutput(output)
	if len(customers) != 1 {
		t.Fatalf("parseCustomerLookupOutput() returned %d customers, want 1", len(customers))
	}
	got := customers[0]
	if got.ID != 12 || got.Name != "MARIA DA SILVA" || got.LegalName != "MARIA SILVA ME" {
		t.Fatalf("unexpected customer identity: %#v", got)
	}
	if got.DocumentMasked != "*******8901" {
		t.Fatalf("DocumentMasked = %q, want %q", got.DocumentMasked, "*******8901")
	}
	if got.Mobile != "74988887777" || got.Mobile2 != "" || got.Email != "maria@example.com" {
		t.Fatalf("unexpected contact fields: %#v", got)
	}
	if got.Address == nil || got.Address.City != "JUAZEIRO" || got.Address.District != "CENTRO" {
		t.Fatalf("unexpected address: %#v", got.Address)
	}
	if got.CreditLimit != 150.50 || got.CreditBalance != 25.25 || got.Blocked != "NAO" {
		t.Fatalf("unexpected internal fields: %#v", got)
	}
}

func TestCustomerLookupToolExecuteUsesConversationSender(t *testing.T) {
	workspace := t.TempDir()
	fdb := filepath.Join(workspace, "host-fbk-reader", "Host.fdb")
	if err := os.MkdirAll(filepath.Dir(fdb), 0o755); err != nil {
		t.Fatalf("mkdir fdb dir: %v", err)
	}
	if err := os.WriteFile(fdb, []byte("test fdb placeholder"), 0o644); err != nil {
		t.Fatalf("write fdb placeholder: %v", err)
	}

	binDir := t.TempDir()
	isqlPath := filepath.Join(binDir, "isql-fb")
	if err := os.WriteFile(isqlPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake isql: %v", err)
	}
	t.Setenv("PATH", binDir)
	t.Setenv("PICOCLAW_CUSTOMER_FDB_PATH", fdb)
	t.Setenv("PICOCLAW_CUSTOMER_FBK_PATH", filepath.Join(workspace, "missing.fbk"))

	runner := &recordingProductRunner{
		out: []byte(strings.Join([]string{
			isqlListLine("ID_CLIENTE", "3"),
			isqlListLine("CLIENTE", "GILBERTO"),
			isqlListLine("CPF_CNPJ", "12345678901"),
			isqlListLine("CELULAR", "4988595684"),
			isqlListLine("STATUS", "ATIVO"),
			isqlListLine("MUNICIPIO", "JUAZEIRO"),
			isqlListLine("UF", "BA"),
			"",
		}, "\n")),
	}
	tool := NewCustomerLookupTool(workspace)
	tool.runner = runner

	ctx := WithToolSenderContext(context.Background(), "554988595684@s.whatsapp.net")
	result := tool.Execute(ctx, map[string]any{})
	if result.IsError {
		t.Fatalf("Execute returned error: %s", result.ForLLM)
	}
	if !result.Silent {
		t.Fatal("customer lookup should return a silent tool result")
	}
	if len(runner.calls) != 1 {
		t.Fatalf("runner calls = %d, want 1", len(runner.calls))
	}
	if runner.calls[0].name != isqlPath {
		t.Fatalf("runner command = %q, want %q", runner.calls[0].name, isqlPath)
	}

	var resp customerLookupResponse
	if err := json.Unmarshal([]byte(result.ForLLM), &resp); err != nil {
		t.Fatalf("response is not valid customer lookup JSON: %v\n%s", err, result.ForLLM)
	}
	if !resp.UsedContextPhone || resp.ContextPhoneLast4 != "5684" {
		t.Fatalf("unexpected context metadata: %#v", resp)
	}
	if resp.Source.Table != "CLIENTES" || resp.Source.FDB != fdb {
		t.Fatalf("unexpected source: %#v", resp.Source)
	}
	if len(resp.Customers) != 1 || resp.Customers[0].Name != "GILBERTO" || resp.Customers[0].DocumentMasked != "*******8901" {
		t.Fatalf("unexpected customers: %#v", resp.Customers)
	}
	if !containsString(resp.SearchDiagnostics.PhoneVariants, "4988595684") {
		t.Fatalf("expected local phone variant in diagnostics: %#v", resp.SearchDiagnostics.PhoneVariants)
	}
}
