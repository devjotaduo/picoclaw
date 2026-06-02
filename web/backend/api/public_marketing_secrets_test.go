package api

import (
	"encoding/json"
	"testing"
)

// catalog-data.json is served publicly, so the PUT handler must never persist
// admin-gate secrets even if a client erroneously syncs them.
func TestStripCatalogSecretsRemovesPinAtAllLevels(t *testing.T) {
	raw := []byte(`{
		"pin": "1234",
		"admin_pin": "9999",
		"empresa": {"nome": "Florescer", "whatsapp": "5511988887777", "senha": "x"},
		"produtos": [{"id": "1", "nome": "Massagem", "preco": 180}]
	}`)
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	out := stripCatalogSecrets(payload)

	if _, ok := out["pin"]; ok {
		t.Error("top-level pin should be stripped")
	}
	if _, ok := out["admin_pin"]; ok {
		t.Error("top-level admin_pin should be stripped")
	}
	if _, ok := out["produtos"]; !ok {
		t.Error("produtos must be preserved")
	}

	empresaRaw, ok := out["empresa"]
	if !ok {
		t.Fatal("empresa must be preserved")
	}
	var empresa map[string]json.RawMessage
	if err := json.Unmarshal(empresaRaw, &empresa); err != nil {
		t.Fatalf("unmarshal empresa: %v", err)
	}
	if _, ok := empresa["senha"]; ok {
		t.Error("nested empresa.senha should be stripped")
	}
	if _, ok := empresa["nome"]; !ok {
		t.Error("nested empresa.nome must be preserved")
	}
	if _, ok := empresa["whatsapp"]; !ok {
		t.Error("nested empresa.whatsapp must be preserved")
	}
}

func TestStripCatalogSecretsLeavesCleanPayloadUntouched(t *testing.T) {
	raw := []byte(`{"empresa": {"nome": "X"}, "produtos": []}`)
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out := stripCatalogSecrets(payload)
	if len(out) != 2 {
		t.Errorf("clean payload should keep its 2 keys, got %d", len(out))
	}
}
