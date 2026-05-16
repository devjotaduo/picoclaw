package inbox

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestRecordMessageBuildsContactInsightAndReport(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "conversations.db"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	now := time.Now().UnixMilli()
	jid := "5574999990000@s.whatsapp.net"
	if err := store.RecordMessage(ctx, Message{
		MessageID: "in-1",
		ChatJID:   jid,
		Direction: DirectionIn,
		Source:    SourceContact,
		Content:   "Meu nome é Maria, sou de Juazeiro. Quero comprar 10 sacos de cimento, qual o preço?",
		TS:        now,
		Delivered: true,
	}, "Maria"); err != nil {
		t.Fatalf("RecordMessage(inbound) error = %v", err)
	}
	if err := store.RecordMessage(ctx, Message{
		MessageID: "out-1",
		ChatJID:   jid,
		Direction: DirectionOut,
		Source:    SourceAgent,
		Content:   "Oi Maria, o cimento está R$ 50.",
		TS:        now + 1000,
		Delivered: true,
	}, ""); err != nil {
		t.Fatalf("RecordMessage(outbound) error = %v", err)
	}

	profile, err := store.GetContactProfile(ctx, jid)
	if err != nil {
		t.Fatalf("GetContactProfile() error = %v", err)
	}
	if profile == nil {
		t.Fatal("GetContactProfile() = nil")
	}
	if profile.Phone != "5574999990000" {
		t.Fatalf("Phone = %q, want parsed phone", profile.Phone)
	}
	if profile.Name != "Maria" {
		t.Fatalf("Name = %q, want Maria", profile.Name)
	}
	if profile.Intent != "orcamento" {
		t.Fatalf("Intent = %q, want orcamento", profile.Intent)
	}
	if profile.LeadStage != "qualificado" {
		t.Fatalf("LeadStage = %q, want qualificado", profile.LeadStage)
	}

	insight, err := store.GetConversationInsight(ctx, jid)
	if err != nil {
		t.Fatalf("GetConversationInsight() error = %v", err)
	}
	if insight == nil {
		t.Fatal("GetConversationInsight() = nil")
	}
	if insight.Unanswered {
		t.Fatal("Unanswered = true after outbound reply")
	}
	if len(insight.Products) == 0 || insight.Products[0].Product != "cimento" {
		t.Fatalf("Products = %#v, want cimento mention", insight.Products)
	}

	report, err := store.BuildReport(ctx, now-1000, now+2000)
	if err != nil {
		t.Fatalf("BuildReport() error = %v", err)
	}
	if report.NewContacts != 1 {
		t.Fatalf("NewContacts = %d, want 1", report.NewContacts)
	}
	if report.Messages != 2 || report.InboundMessages != 1 || report.AgentReplies != 1 {
		t.Fatalf("unexpected report message counts: %+v", report)
	}
	if report.QualifiedLeads != 1 {
		t.Fatalf("QualifiedLeads = %d, want 1", report.QualifiedLeads)
	}
	if len(report.TopProducts) == 0 || report.TopProducts[0].Label != "cimento" {
		t.Fatalf("TopProducts = %#v, want cimento", report.TopProducts)
	}
}

func TestSaveContactProfile(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "conversations.db"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	jid := "5574888880000@s.whatsapp.net"
	if err := store.RecordMessage(ctx, Message{
		MessageID: "in-1",
		ChatJID:   jid,
		Direction: DirectionIn,
		Source:    SourceContact,
		Content:   "Oi",
		Delivered: true,
	}, "Contato"); err != nil {
		t.Fatalf("RecordMessage() error = %v", err)
	}
	saved, err := store.SaveContactProfile(ctx, ContactProfile{
		ChatJID:       jid,
		Name:          "Cliente Teste",
		City:          "Juazeiro",
		LeadStage:     "follow_up",
		Priority:      "medium",
		ConsentStatus: "consented",
		Tags:          []string{"vip", "obra"},
		NextAction:    "Retornar amanhã",
	})
	if err != nil {
		t.Fatalf("SaveContactProfile() error = %v", err)
	}
	if saved.Name != "Cliente Teste" || saved.City != "Juazeiro" {
		t.Fatalf("saved profile mismatch: %+v", saved)
	}
	if len(saved.Tags) != 2 {
		t.Fatalf("Tags = %#v, want two tags", saved.Tags)
	}
}
