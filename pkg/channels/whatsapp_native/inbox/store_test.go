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

func TestMarkUnreadAndRead(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "conversations.db"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	jid := "5574111110000@s.whatsapp.net"
	if err := store.RecordMessage(ctx, Message{
		MessageID: "in-1", ChatJID: jid, Direction: DirectionIn,
		Source: SourceContact, Content: "oi", Delivered: true,
	}, "Maria"); err != nil {
		t.Fatalf("RecordMessage() error = %v", err)
	}
	chat, _ := store.GetChat(ctx, jid)
	if chat.UnreadCount != 1 {
		t.Fatalf("UnreadCount after inbound = %d, want 1", chat.UnreadCount)
	}
	if err := store.MarkRead(ctx, jid); err != nil {
		t.Fatalf("MarkRead() error = %v", err)
	}
	chat, _ = store.GetChat(ctx, jid)
	if chat.UnreadCount != 0 {
		t.Fatalf("UnreadCount after MarkRead = %d, want 0", chat.UnreadCount)
	}
	if err := store.MarkUnread(ctx, jid); err != nil {
		t.Fatalf("MarkUnread() error = %v", err)
	}
	chat, _ = store.GetChat(ctx, jid)
	if chat.UnreadCount != 1 {
		t.Fatalf("UnreadCount after MarkUnread = %d, want 1", chat.UnreadCount)
	}
	// MarkUnread on a chat already with multiple unreads must NOT clobber.
	if err := store.RecordMessage(ctx, Message{
		MessageID: "in-2", ChatJID: jid, Direction: DirectionIn,
		Source: SourceContact, Content: "ola?", Delivered: true,
	}, "Maria"); err != nil {
		t.Fatalf("second RecordMessage() error = %v", err)
	}
	chat, _ = store.GetChat(ctx, jid)
	if chat.UnreadCount != 2 {
		t.Fatalf("UnreadCount after second inbound = %d, want 2", chat.UnreadCount)
	}
	if err := store.MarkUnread(ctx, jid); err != nil {
		t.Fatalf("idempotent MarkUnread() error = %v", err)
	}
	chat, _ = store.GetChat(ctx, jid)
	if chat.UnreadCount != 2 {
		t.Fatalf("MarkUnread clobbered higher count: got %d, want 2", chat.UnreadCount)
	}
}

func TestInternalNotesCRUD(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "conversations.db"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	jid := "5574222220000@s.whatsapp.net"
	if err := store.RecordMessage(ctx, Message{
		MessageID: "in-1", ChatJID: jid, Direction: DirectionIn,
		Source: SourceContact, Content: "oi", Delivered: true,
	}, "Joao"); err != nil {
		t.Fatalf("RecordMessage() error = %v", err)
	}
	first, err := store.AddInternalNote(ctx, InternalNote{
		ChatJID: jid, Content: "Cliente preferiu boleto", Author: "Ana",
	})
	if err != nil {
		t.Fatalf("AddInternalNote() error = %v", err)
	}
	if first.ID == 0 {
		t.Fatal("expected non-zero id")
	}
	if first.TS == 0 {
		t.Fatal("expected TS to be set when zero")
	}
	second, err := store.AddInternalNote(ctx, InternalNote{
		ChatJID: jid, Content: "Aguardando RG", Author: "Ana",
	})
	if err != nil {
		t.Fatalf("AddInternalNote(2) error = %v", err)
	}
	if second.ID == first.ID {
		t.Fatal("second note got same id as first")
	}

	notes, err := store.ListInternalNotes(ctx, jid, 0)
	if err != nil {
		t.Fatalf("ListInternalNotes() error = %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("expected 2 notes, got %d", len(notes))
	}
	// Newest first.
	if notes[0].ID != second.ID {
		t.Fatalf("expected newest note first, got id %d", notes[0].ID)
	}

	if err := store.DeleteInternalNote(ctx, jid, first.ID); err != nil {
		t.Fatalf("DeleteInternalNote() error = %v", err)
	}
	notes, _ = store.ListInternalNotes(ctx, jid, 0)
	if len(notes) != 1 || notes[0].ID != second.ID {
		t.Fatalf("after delete: notes = %+v", notes)
	}

	// Idempotent — deleting a non-existent id must not error.
	if err := store.DeleteInternalNote(ctx, jid, 99999); err != nil {
		t.Fatalf("Delete missing returned error: %v", err)
	}
	// JID mismatch must not delete the wrong chat's note.
	if err := store.DeleteInternalNote(ctx, "other@s.whatsapp.net", second.ID); err != nil {
		t.Fatalf("cross-jid delete returned error: %v", err)
	}
	notes, _ = store.ListInternalNotes(ctx, jid, 0)
	if len(notes) != 1 {
		t.Fatalf("cross-jid delete clobbered note: %+v", notes)
	}
}
