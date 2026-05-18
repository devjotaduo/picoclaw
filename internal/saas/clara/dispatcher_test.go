package clara

import (
	"encoding/json"
	"testing"
)

func TestApply_SetIdentity_PopulatesNamesWithoutAnswersDelta(t *testing.T) {
	mut, err := Apply("set_identity",
		json.RawMessage(`{"contact_name":"Eduardo","company_name":"Acme"}`), nil)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if mut.ContactName != "Eduardo" || mut.CompanyName != "Acme" {
		t.Fatalf("identity = %+v", mut)
	}
	if mut.AnswersDelta != nil {
		t.Fatalf("identity should not touch answers blob")
	}
}

func TestApply_SetBusiness_MergesSegmentsWithoutDuplicating(t *testing.T) {
	answers := &Answers{Segments: []string{"serviços"}, Extra: map[string]any{}}
	mut, err := Apply("set_business",
		json.RawMessage(`{"description":"Loja de móveis","segments":["serviços","produtos físicos"],"business_models":["B2C"]}`),
		answers)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if mut.AnswersDelta == nil {
		t.Fatal("expected answers delta")
	}
	if mut.AnswersDelta.Offer != "Loja de móveis" {
		t.Fatalf("offer = %q", mut.AnswersDelta.Offer)
	}
	if got := mut.AnswersDelta.Segments; len(got) != 2 || got[0] != "serviços" || got[1] != "produtos físicos" {
		t.Fatalf("segments = %v, want unique merge", got)
	}
}

func TestApply_SetChannels_NormalizesAliases(t *testing.T) {
	answers := &Answers{Extra: map[string]any{}}
	mut, err := Apply("set_channels",
		json.RawMessage(`{"channels":["WhatsApp","ig","Site"]}`),
		answers)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	got := mut.AnswersDelta.Channels
	want := []string{"whatsapp", "instagram", "site"}
	if len(got) != len(want) {
		t.Fatalf("channels = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("channels[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestApply_SetPain_AppendsNonEmpty(t *testing.T) {
	answers := &Answers{Pains: []string{"demora pra responder"}, Extra: map[string]any{}}
	mut, err := Apply("set_pain",
		json.RawMessage(`{"text":"esquecer de cobrar","urgency":"high"}`),
		answers)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if got := mut.AnswersDelta.Pains; len(got) != 2 || got[1] != "esquecer de cobrar" {
		t.Fatalf("pains = %v, want 2 entries with new one appended", got)
	}
}

func TestApply_MarkQualified_SetsFlagAndReason(t *testing.T) {
	mut, err := Apply("mark_qualified",
		json.RawMessage(`{"reason":"loja B2C com whatsapp e dor de orçamentos"}`), nil)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if !mut.MarkQualified {
		t.Fatal("expected MarkQualified=true")
	}
	if mut.QualifiedReason == "" {
		t.Fatal("expected reason populated")
	}
}

func TestApply_UnknownTool_ReturnsError(t *testing.T) {
	if _, err := Apply("rm_rf_database", json.RawMessage(`{}`), nil); err == nil {
		t.Fatal("expected error for unknown tool")
	}
}

func TestParseAnswers_PreservesUnknownKeys(t *testing.T) {
	raw := json.RawMessage(`{"offer":"x","brand_soul":"divertido","city_region":"SP"}`)
	a, err := ParseAnswers(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if a.Offer != "x" {
		t.Fatalf("offer = %q", a.Offer)
	}
	if a.Extra["brand_soul"] != "divertido" {
		t.Fatalf("brand_soul not preserved: %v", a.Extra)
	}
	if a.Extra["city_region"] != "SP" {
		t.Fatalf("city_region not preserved: %v", a.Extra)
	}
}

func TestApply_SetProblemArea_PersistsAreaAndNote(t *testing.T) {
	answers := &Answers{Extra: map[string]any{}}
	mut, err := Apply("set_problem_area",
		json.RawMessage(`{"area":"agendamento","note":"perde horário sem confirmar"}`),
		answers)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if mut.AnswersDelta == nil {
		t.Fatal("expected answers delta")
	}
	if mut.AnswersDelta.ProblemArea != "agendamento" {
		t.Fatalf("ProblemArea = %q, want %q", mut.AnswersDelta.ProblemArea, "agendamento")
	}
	if mut.AnswersDelta.ProblemAreaNote != "perde horário sem confirmar" {
		t.Fatalf("ProblemAreaNote = %q", mut.AnswersDelta.ProblemAreaNote)
	}
}

func TestApply_SetProblemArea_RejectsUnknownArea(t *testing.T) {
	answers := &Answers{Extra: map[string]any{}}
	_, err := Apply("set_problem_area",
		json.RawMessage(`{"area":"finance"}`),
		answers)
	if err == nil {
		t.Fatal("expected error for unknown problem area")
	}
}

func TestApply_SetSalesMode_PersistsOnlineProductType(t *testing.T) {
	answers := &Answers{Extra: map[string]any{}}
	mut, err := Apply("set_sales_mode",
		json.RawMessage(`{"online":true,"product_type":"Físico","note":"roupas femininas pelo Insta"}`),
		answers)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if mut.AnswersDelta == nil {
		t.Fatal("expected answers delta")
	}
	if mut.AnswersDelta.SalesOnline == nil || !*mut.AnswersDelta.SalesOnline {
		t.Fatalf("SalesOnline = %v, want pointer to true", mut.AnswersDelta.SalesOnline)
	}
	if mut.AnswersDelta.ProductType != "físico" {
		t.Fatalf("ProductType = %q, want lowercased 'físico'", mut.AnswersDelta.ProductType)
	}
	if mut.AnswersDelta.SalesNote != "roupas femininas pelo Insta" {
		t.Fatalf("SalesNote = %q", mut.AnswersDelta.SalesNote)
	}
}

func TestAnswers_MarshalRoundTrip(t *testing.T) {
	a := &Answers{
		Offer:    "Vende móveis",
		Segments: []string{"serviços"},
		Channels: []string{"whatsapp"},
		Pains:    []string{"orçamentos demorados"},
		Extra:    map[string]any{"city_region": "Curitiba"},
	}
	raw, err := a.Marshal()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	round, err := ParseAnswers(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if round.Offer != a.Offer || len(round.Pains) != 1 || round.Extra["city_region"] != "Curitiba" {
		t.Fatalf("round-trip lost data: %+v", round)
	}
}

func TestAnswers_MarshalRoundTrip_NewStructuredFields(t *testing.T) {
	online := true
	a := &Answers{
		ProblemArea:     "agendamento",
		ProblemAreaNote: "perde horário",
		SalesOnline:     &online,
		ProductType:     "serviço",
		SalesNote:       "atende em domicílio",
		Extra:           map[string]any{},
	}
	raw, err := a.Marshal()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	round, err := ParseAnswers(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if round.ProblemArea != "agendamento" || round.ProblemAreaNote != "perde horário" {
		t.Fatalf("problem area round-trip = %+v", round)
	}
	if round.SalesOnline == nil || !*round.SalesOnline {
		t.Fatalf("SalesOnline lost: %v", round.SalesOnline)
	}
	if round.ProductType != "serviço" || round.SalesNote != "atende em domicílio" {
		t.Fatalf("sales mode round-trip = %+v", round)
	}
}
