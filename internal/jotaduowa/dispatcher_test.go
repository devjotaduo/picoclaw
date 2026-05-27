package jotaduowa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const testDispatchSecret = "dispatch-secret"

func TestDispatcher_RoutesToCorrectTenant(t *testing.T) {
	routing, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = routing.Close() })

	ctx := context.Background()
	if err := routing.Register(ctx, "5511999998888", "tenant-a"); err != nil {
		t.Fatalf("Register: %v", err)
	}

	// Capture the request that arrives at "tenant A". HMAC verification
	// mirrors what the launcher side does — if this assertion passes, the
	// real launcher endpoint will accept the same payload.
	var (
		mu      sync.Mutex
		gotURL  string
		gotSig  string
		gotBody []byte
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		gotURL = r.URL.Path
		gotSig = r.Header.Get(hmacSigHeader)
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	d := NewDispatcher(routing, testDispatchSecret, srv.URL+"/{id}")

	d.Dispatch(InboundMessage{
		ChatJID:   "5511999998888@s.whatsapp.net",
		SenderJID: "5511999998888@s.whatsapp.net",
		PushName:  "Pedro Clínica",
		MessageID: "wamid.HBgN",
		Content:   "Oi Catarina, agora pode",
		Timestamp: time.Unix(1715000000, 0),
	})

	mu.Lock()
	defer mu.Unlock()
	if !strings.HasSuffix(gotURL, "/tenant-a"+inboundWebhookPath) {
		t.Errorf("URL = %q, want suffix %q", gotURL, "/tenant-a"+inboundWebhookPath)
	}
	if gotSig == "" {
		t.Error("expected HMAC signature header to be set")
	}
	// Verify the signature matches the body.
	if want := signWebhook(gotBody, testDispatchSecret); gotSig != want {
		t.Errorf("HMAC mismatch: got %q, want %q", gotSig, want)
	}

	var got inboundWebhookBody
	if err := json.Unmarshal(gotBody, &got); err != nil {
		t.Fatalf("unmarshal body: %v (raw=%s)", err, gotBody)
	}
	if got.TenantID != "tenant-a" {
		t.Errorf("TenantID = %q, want tenant-a", got.TenantID)
	}
	if got.FromPhone != "5511999998888" {
		t.Errorf("FromPhone = %q, want normalized 5511999998888", got.FromPhone)
	}
	if got.Content != "Oi Catarina, agora pode" {
		t.Errorf("Content = %q", got.Content)
	}
	if got.SentAt == 0 {
		t.Error("SentAt missing")
	}
}

func TestDispatcher_NoRoutingDrops(t *testing.T) {
	routing, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = routing.Close() })

	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	d := NewDispatcher(routing, testDispatchSecret, srv.URL+"/{id}")
	d.Dispatch(InboundMessage{
		SenderJID: "5511000000000@s.whatsapp.net",
		Content:   "cold lead, no prior outreach",
	})
	if calls != 0 {
		t.Errorf("expected 0 webhook calls for unrouted phone, got %d", calls)
	}
}

func TestDispatcher_NonScientificURLPatternRejected(t *testing.T) {
	routing, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = routing.Close() })
	_ = routing.Register(context.Background(), "5511999998888", "tenant-a")

	// Pattern without "{id}" must fail urlForTenant — otherwise every
	// dispatch would go to the same URL regardless of tenant. The dispatch
	// silently drops; we exercise urlForTenant directly to assert.
	d := NewDispatcher(routing, testDispatchSecret, "http://wherever:18800")
	if _, err := d.urlForTenant("tenant-a"); err == nil {
		t.Error("expected error for pattern without {id}, got nil")
	}
}

func TestDispatcher_LauncherFailureDoesNotCrash(t *testing.T) {
	routing, err := OpenRouting(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRouting: %v", err)
	}
	t.Cleanup(func() { _ = routing.Close() })
	_ = routing.Register(context.Background(), "5511999998888", "tenant-a")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	d := NewDispatcher(routing, testDispatchSecret, srv.URL+"/{id}")
	// Just must not panic. The error is logged + dropped.
	d.Dispatch(InboundMessage{
		SenderJID: "5511999998888@s.whatsapp.net",
		Content:   "irrelevant",
	})
}
