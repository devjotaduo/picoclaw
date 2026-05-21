package publicweb

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/bus"
)

func TestServeHTTP_Health(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodGet, "/api/public/chat/health", nil)
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%q", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != `{"ok":true}` {
		t.Fatalf("body = %q, want %q", got, `{"ok":true}`)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q, want application/json", ct)
	}
}

func TestServeHTTP_Post_AcceptsMessage(t *testing.T) {
	mb := bus.NewMessageBus()
	ch := newTestChannelWithBus(t, mb)

	// Drain the inbound bus so AcceptInbound -> HandleMessageWithContext
	// does not block on a full channel.
	drainInbound(t, mb)

	body := bytes.NewBufferString(`{"session_id":"sess-1","message":"hello"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/public/chat", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202; body=%q", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"accepted"`) {
		t.Fatalf("body = %q, want {\"status\":\"accepted\"}", rec.Body.String())
	}
}

func TestServeHTTP_Post_RejectsEmptyBody(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodPost, "/api/public/chat", strings.NewReader(""))
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%q", rec.Code, rec.Body.String())
	}
}

func TestServeHTTP_Post_RejectsMissingSessionID(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodPost, "/api/public/chat",
		strings.NewReader(`{"message":"hi"}`))
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%q", rec.Code, rec.Body.String())
	}
}

func TestServeHTTP_Post_RejectsMissingMessage(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodPost, "/api/public/chat",
		strings.NewReader(`{"session_id":"sess-1"}`))
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%q", rec.Code, rec.Body.String())
	}
}

func TestServeHTTP_Post_RequiresCaptchaWhenConfigured(t *testing.T) {
	mb := bus.NewMessageBus()
	ch := NewChannel(mb, &Settings{
		RateLimitPerIP:       30,
		SessionTTLSeconds:    1800,
		RequireCaptchaHeader: true,
	})
	if err := ch.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = ch.Stop(context.Background()) })
	drainInbound(t, mb)

	// Without captcha -> 403.
	body := strings.NewReader(`{"session_id":"s1","message":"hi"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/public/chat", body)
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("no captcha: status = %d, want 403; body=%q", rec.Code, rec.Body.String())
	}

	// With captcha -> 202.
	body2 := strings.NewReader(`{"session_id":"s1","message":"hi"}`)
	req2 := httptest.NewRequest(http.MethodPost, "/api/public/chat", body2)
	req2.Header.Set("X-Captcha-Token", "ok")
	rec2 := httptest.NewRecorder()
	ch.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusAccepted {
		t.Fatalf("with captcha: status = %d, want 202; body=%q", rec2.Code, rec2.Body.String())
	}
}

func TestServeHTTP_Stream_RequiresSessionID(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodGet, "/api/public/chat/stream", nil)
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%q", rec.Code, rec.Body.String())
	}
}

func TestServeHTTP_Stream_OpensEvent(t *testing.T) {
	ch := newTestChannel(t)

	// Use a real httptest.Server so the response writer supports streaming
	// and the request context cancels properly when we close the response.
	srv := httptest.NewServer(http.HandlerFunc(ch.ServeHTTP))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		srv.URL+"/api/public/chat/stream?session_id=sess-x",
		nil,
	)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content-type = %q, want text/event-stream", ct)
	}

	// Read until we see the "open" SSE event, then cancel.
	buf := make([]byte, 256)
	deadline := time.Now().Add(1500 * time.Millisecond)
	var seen bytes.Buffer
	for time.Now().Before(deadline) {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			seen.Write(buf[:n])
			if strings.Contains(seen.String(), "event: open") {
				return
			}
		}
		if err != nil {
			break
		}
	}
	t.Fatalf("did not see 'event: open' in stream output; got %q", seen.String())
}

func TestServeHTTP_Stream_ForwardsMessage(t *testing.T) {
	ch := newTestChannel(t)

	srv := httptest.NewServer(http.HandlerFunc(ch.ServeHTTP))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		srv.URL+"/api/public/chat/stream?session_id=msg-sess",
		nil,
	)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	// Wait until SubscribeStream has registered our session (the handler
	// subscribes synchronously before the first read). Poll the channel
	// state instead of guessing with sleeps.
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		ch.mu.RLock()
		_, ok := ch.streams["msg-sess"]
		ch.mu.RUnlock()
		if ok {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Now push an outbound message via Send and verify it surfaces in the
	// SSE stream as event: message with the agent text.
	go func() {
		_, _ = ch.Send(context.Background(), bus.OutboundMessage{
			Channel: ChannelName,
			ChatID:  "msg-sess",
			Content: "hello from agent",
		})
	}()

	buf := make([]byte, 512)
	var seen bytes.Buffer
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			seen.Write(buf[:n])
			if strings.Contains(seen.String(), "hello from agent") {
				return
			}
		}
		if err != nil {
			break
		}
	}
	t.Fatalf("did not see agent text in stream; got %q", seen.String())
}

func TestServeHTTP_NotRunning_503(t *testing.T) {
	mb := bus.NewMessageBus()
	ch := NewChannel(mb, nil)
	// Intentionally do NOT call Start.

	req := httptest.NewRequest(http.MethodGet, "/api/public/chat/health", nil)
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503; body=%q", rec.Code, rec.Body.String())
	}
}

func TestServeHTTP_UnknownPath_404(t *testing.T) {
	ch := newTestChannel(t)

	req := httptest.NewRequest(http.MethodGet, "/api/public/something", nil)
	rec := httptest.NewRecorder()
	ch.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%q", rec.Code, rec.Body.String())
	}
}

func TestClientIPFromRequest(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(r *http.Request)
		expect string
	}{
		{
			name: "XForwardedFor multi",
			setup: func(r *http.Request) {
				r.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
			},
			expect: "203.0.113.5",
		},
		{
			name: "XForwardedFor single",
			setup: func(r *http.Request) {
				r.Header.Set("X-Forwarded-For", "203.0.113.5")
			},
			expect: "203.0.113.5",
		},
		{
			name: "XRealIP fallback",
			setup: func(r *http.Request) {
				r.Header.Set("X-Real-IP", "198.51.100.7")
			},
			expect: "198.51.100.7",
		},
		{
			name:   "RemoteAddr fallback",
			setup:  func(r *http.Request) { r.RemoteAddr = "192.0.2.1:54321" },
			expect: "192.0.2.1:54321",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = ""
			tc.setup(req)
			if got := clientIPFromRequest(req); got != tc.expect {
				t.Fatalf("clientIPFromRequest = %q, want %q", got, tc.expect)
			}
		})
	}
}

// newTestChannelWithBus creates a Channel attached to the provided bus,
// starts it, and registers a cleanup that stops it. Used when the test
// also wants to interact with the bus directly (e.g. to drain inbound).
func newTestChannelWithBus(t *testing.T, mb *bus.MessageBus) *Channel {
	t.Helper()
	ch := NewChannel(mb, nil)
	if err := ch.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = ch.Stop(context.Background()) })
	return ch
}

// drainInbound consumes from the bus's inbound channel in a background
// goroutine until the test ends. This prevents AcceptInbound from blocking
// when no agent loop is wired up.
func drainInbound(t *testing.T, mb *bus.MessageBus) {
	t.Helper()
	if mb == nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	in := mb.InboundChan()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-in:
			}
		}
	}()
}
