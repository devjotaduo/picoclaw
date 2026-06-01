package api

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestRosterActiveAgentIDs(t *testing.T) {
	raw := json.RawMessage(`[
      {"id":"rafael","role":"master","label":"Rafael","desc":"x","locked":true},
      {"id":"clara","role":"atendente","label":"Clara","desc":"y","locked":true},
      {"id":"camila","role":"especialista","label":"Camila","desc":"z"}
    ]`)
	ids, err := rosterActiveAgentIDs(raw)
	if err != nil {
		t.Fatalf("rosterActiveAgentIDs: %v", err)
	}
	want := []string{"rafael", "clara", "camila"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("want %v got %v", want, ids)
	}
}

func TestRosterActiveAgentIDsLegacyStringArrayIsEmpty(t *testing.T) {
	ids, err := rosterActiveAgentIDs(json.RawMessage(`["attendant","assistant"]`))
	if err != nil || len(ids) != 0 {
		t.Fatalf("legacy roster should yield no ids, got %v err %v", ids, err)
	}
}

func TestRosterActiveAgentIDsEmpty(t *testing.T) {
	ids, err := rosterActiveAgentIDs(nil)
	if err != nil || len(ids) != 0 {
		t.Fatalf("empty roster should yield no ids, got %v err %v", ids, err)
	}
}

func TestRosterActiveAgentIDsNormalizesAndDedups(t *testing.T) {
	// Whitespace + uppercase ids normalize to lowercase-trimmed; a duplicate
	// (after normalization) is dropped, order preserved.
	raw := json.RawMessage(`[
      {"id":"  CAMILA  ","role":"especialista","label":"Camila","desc":"z"},
      {"id":"clara","role":"atendente","label":"Clara","desc":"y"},
      {"id":"Camila","role":"especialista","label":"Camila 2","desc":"dup"}
    ]`)
	ids, err := rosterActiveAgentIDs(raw)
	if err != nil {
		t.Fatalf("rosterActiveAgentIDs: %v", err)
	}
	want := []string{"camila", "clara"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("want %v got %v", want, ids)
	}
}

func TestRosterActiveAgentIDsAllEmptyIDsIsNil(t *testing.T) {
	// Object entries with no id (or a mixed array with a bare string) carry no
	// activation; the result must be the nil sentinel, not []string{}.
	raw := json.RawMessage(`[{"role":"master"},{"role":"atendente"}]`)
	ids, err := rosterActiveAgentIDs(raw)
	if err != nil {
		t.Fatalf("rosterActiveAgentIDs: %v", err)
	}
	if ids != nil {
		t.Fatalf("all-empty-id roster should yield nil, got %v", ids)
	}
}
