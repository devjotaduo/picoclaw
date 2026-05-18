package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type recordingProductRunner struct {
	out   []byte
	err   error
	calls []recordedProductCommand
}

type recordedProductCommand struct {
	name string
	args []string
}

func (r *recordingProductRunner) Run(_ context.Context, name string, args ...string) ([]byte, error) {
	r.calls = append(r.calls, recordedProductCommand{
		name: name,
		args: append([]string(nil), args...),
	})
	return r.out, r.err
}

func TestProductSearchTermsNormalizeCustomerPhrase(t *testing.T) {
	got := productSearchTerms("Vocês têm abraçadeira 1/2?")
	want := []string{"abraçadeira", "1/2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("productSearchTerms() = %#v, want %#v", got, want)
	}

	variants := productTermVariants("abraçadeira")
	if !containsString(variants, "abraçadeira") || !containsString(variants, "abracadeira") {
		t.Fatalf("productTermVariants() = %#v, want accented and ASCII variants", variants)
	}
}

func TestBuildProductLookupSQLEscapesAndFilters(t *testing.T) {
	sql := buildProductLookupSQL([]string{"cano' pvc", "1/2"}, 99, true, false)

	for _, want := range []string{
		"SELECT FIRST 10",
		"TRIM(p.STATUS) = 'ATIVO'",
		"COALESCE(p.ESTOQUE, 0) > 0",
		"cano'' pvc",
		"UPPER(TRIM(p.PRODUTO)) STARTING WITH UPPER('cano'' pvc 1/2')",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("SQL missing %q:\n%s", want, sql)
		}
	}
}

func TestBuildProductLookupSQLCanIncludeInactive(t *testing.T) {
	sql := buildProductLookupSQL([]string{"oleo"}, 3, false, true)
	if strings.Contains(sql, "TRIM(p.STATUS) = 'ATIVO'") {
		t.Fatalf("SQL should not force active products when includeInactive=true:\n%s", sql)
	}
	if !strings.Contains(sql, "SELECT FIRST 3") {
		t.Fatalf("SQL should keep requested limit:\n%s", sql)
	}
}

func TestParseProductLookupOutput(t *testing.T) {
	output := strings.Join([]string{
		isqlListLine("ID_PRODUTO", "42"),
		isqlListLine("PRODUTO", "ABRACADEIRA 1/2"),
		isqlListLine("BARRAS", "789000000001"),
		isqlListLine("GTIN", "<null>"),
		isqlListLine("GRUPO", "CONEXOES"),
		isqlListLine("MARCA", "TIGRE"),
		isqlListLine("UNIDADE", "UN"),
		isqlListLine("ESTOQUE", "12,5"),
		isqlListLine("VALOR_VENDA", "8,90"),
		isqlListLine("VALOR_ATACADO", "7.50"),
		isqlListLine("VALOR_APRAZO", "9"),
		isqlListLine("VALOR_PROMOCIONAL", "<null>"),
		isqlListLine("STATUS", "ATIVO"),
		isqlListLine("REFERENCIA", "ABC-123"),
		isqlListLine("APLICACAO", "HIDRAULICA"),
		isqlListLine("LOCALIZACAO", "A1"),
		"",
	}, "\n")

	products := parseProductLookupOutput(output)
	if len(products) != 1 {
		t.Fatalf("parseProductLookupOutput() returned %d products, want 1", len(products))
	}

	got := products[0]
	if got.ID != 42 || got.Name != "ABRACADEIRA 1/2" || got.Barcode != "789000000001" {
		t.Fatalf("unexpected product identity: %#v", got)
	}
	if got.GTIN != "" {
		t.Fatalf("GTIN should be empty for <null>, got %q", got.GTIN)
	}
	if got.Group != "CONEXOES" || got.Brand != "TIGRE" || got.Unit != "UN" {
		t.Fatalf("unexpected product classification: %#v", got)
	}
	if got.Stock != 12.5 || got.SalePrice != 8.90 || got.WholesalePrice != 7.50 || got.InstallmentPrice != 9 {
		t.Fatalf("unexpected numeric fields: %#v", got)
	}
	if got.PromotionalPrice != 0 || got.Status != "ATIVO" || got.Reference != "ABC-123" {
		t.Fatalf("unexpected optional fields: %#v", got)
	}
}

func TestProductLookupToolExecuteUsesRestoredFDBAndReturnsJSON(t *testing.T) {
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
	t.Setenv("PICOCLAW_PRODUCT_FDB_PATH", fdb)
	t.Setenv("PICOCLAW_PRODUCT_FBK_PATH", filepath.Join(workspace, "missing.fbk"))

	runner := &recordingProductRunner{
		out: []byte(strings.Join([]string{
			isqlListLine("ID_PRODUTO", "7"),
			isqlListLine("PRODUTO", "OLEO 20W50"),
			isqlListLine("ESTOQUE", "3"),
			isqlListLine("VALOR_VENDA", "29.9"),
			isqlListLine("STATUS", "ATIVO"),
			"",
		}, "\n")),
	}
	tool := NewProductLookupTool(workspace)
	tool.runner = runner

	result := tool.Execute(context.Background(), map[string]any{
		"query":         "tem óleo 20w50?",
		"limit":         1,
		"only_in_stock": true,
	})
	if result.IsError {
		t.Fatalf("Execute returned error: %s", result.ForLLM)
	}
	if !result.Silent {
		t.Fatal("product lookup should return a silent tool result")
	}
	if len(runner.calls) != 1 {
		t.Fatalf("runner calls = %d, want 1", len(runner.calls))
	}
	if runner.calls[0].name != isqlPath {
		t.Fatalf("runner command = %q, want %q", runner.calls[0].name, isqlPath)
	}

	var resp productLookupResponse
	if err := json.Unmarshal([]byte(result.ForLLM), &resp); err != nil {
		t.Fatalf("response is not valid product lookup JSON: %v\n%s", err, result.ForLLM)
	}
	if resp.Query != "tem óleo 20w50?" || resp.Count != 1 || resp.Limit != 1 {
		t.Fatalf("unexpected response metadata: %#v", resp)
	}
	if resp.Source.Table != "PRODUTOS" || resp.Source.FDB != fdb {
		t.Fatalf("unexpected source: %#v", resp.Source)
	}
	if len(resp.Products) != 1 || resp.Products[0].Name != "OLEO 20W50" || resp.Products[0].SalePrice != 29.9 {
		t.Fatalf("unexpected products: %#v", resp.Products)
	}
}

func TestDecodeProductCommandOutputFallsBackToSingleByte(t *testing.T) {
	got := decodeProductCommandOutput([]byte{'a', 'c', 0xe7, 0xe3, 'o'})
	if got != "acção" {
		t.Fatalf("decodeProductCommandOutput() = %q, want %q", got, "acção")
	}
}

func isqlListLine(field, value string) string {
	return fmt.Sprintf("%-31s%s", field, value)
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
