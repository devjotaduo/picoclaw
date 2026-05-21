package publicweb

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/bus"
)

// newTestChannel returns a started Channel backed by a fresh, anonymous
// MessageBus that is never consumed. Tests that do not exercise inbound
// publish (which would block on a full bus) can use this freely.
func newTestChannel(t *testing.T) *Channel {
	t.Helper()
	mb := bus.NewMessageBus()
	ch := NewChannel(mb, nil)
	if err := ch.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() {
		_ = ch.Stop(context.Background())
	})
	return ch
}

func TestCanonicalSenderID_Stable(t *testing.T) {
	ch := newTestChannel(t)

	a1 := ch.CanonicalSenderID("session-abc", "1.2.3.4")
	a2 := ch.CanonicalSenderID("session-abc", "1.2.3.4")
	if a1 != a2 {
		t.Fatalf("expected same id for same (session, ip), got %q vs %q", a1, a2)
	}
	if !strings.HasPrefix(a1, ChannelName+":") {
		t.Fatalf("expected id to be prefixed with %q, got %q", ChannelName+":", a1)
	}
	// "public-web:" + 16 hex chars = 11 + 16 = 27.
	if got := len(a1); got != len(ChannelName)+1+16 {
		t.Fatalf("expected id length %d, got %d (%q)", len(ChannelName)+1+16, got, a1)
	}

	b1 := ch.CanonicalSenderID("session-different", "1.2.3.4")
	if a1 == b1 {
		t.Fatalf("expected different ids for different sessions, both = %q", a1)
	}
}

func TestCanonicalSenderID_DifferentIPSameSession_DifferentID(t *testing.T) {
	// Documents the v1 limitation: changing IP within the same session
	// produces a new identity. Acceptable for anonymous onboarding.
	ch := newTestChannel(t)

	a := ch.CanonicalSenderID("session-1", "1.2.3.4")
	b := ch.CanonicalSenderID("session-1", "5.6.7.8")
	if a == b {
		t.Fatalf("expected different ids for different ips, both = %q", a)
	}
}

func TestIsAllowed_AlwaysTrue(t *testing.T) {
	ch := newTestChannel(t)
	if !ch.IsAllowed("") {
		t.Fatal(`IsAllowed("") = false, want true`)
	}
	if !ch.IsAllowed("anything") {
		t.Fatal(`IsAllowed("anything") = false, want true`)
	}
	if !ch.IsAllowed("public-web:deadbeefdeadbeef") {
		t.Fatal("IsAllowed(canonical) = false, want true")
	}
}

func TestIsAllowedSender_AlwaysTrue(t *testing.T) {
	ch := newTestChannel(t)
	if !ch.IsAllowedSender(bus.SenderInfo{}) {
		t.Fatal("IsAllowedSender(empty) = false, want true")
	}
	if !ch.IsAllowedSender(bus.SenderInfo{Platform: ChannelName, PlatformID: "x"}) {
		t.Fatal("IsAllowedSender(populated) = false, want true")
	}
}

func TestSubscribeStream_AndUnsubscribe(t *testing.T) {
	ch := newTestChannel(t)

	stream := ch.SubscribeStream("session-1")
	if stream == nil {
		t.Fatal("SubscribeStream returned nil")
	}

	ch.UnsubscribeStream("session-1")

	// Range must terminate (channel was closed). If Unsubscribe forgot to
	// close, this test will block forever and the testing framework will
	// kill it after the package timeout — surfacing the bug clearly.
	done := make(chan struct{})
	go func() {
		for range stream {
			// drain any residual; should be empty
		}
		close(done)
	}()

	select {
	case <-done:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("stream did not close after Unsubscribe")
	}
}

func TestUnsubscribe_Idempotent(t *testing.T) {
	ch := newTestChannel(t)

	ch.SubscribeStream("session-2")
	ch.UnsubscribeStream("session-2")
	// Second call must be a no-op, not a panic.
	ch.UnsubscribeStream("session-2")
	// Calling on a session that was never subscribed must also be safe.
	ch.UnsubscribeStream("never-existed")
}

func TestSend_NoStream_ReturnsError(t *testing.T) {
	ch := newTestChannel(t)

	_, err := ch.Send(context.Background(), bus.OutboundMessage{
		Channel: ChannelName,
		ChatID:  "session-with-no-subscriber",
		Content: "hello",
	})
	if err == nil {
		t.Fatal("Send to unknown session returned nil error, want ErrNoStream")
	}
	if err != ErrNoStream {
		t.Fatalf("Send returned %v, want ErrNoStream", err)
	}
}

func TestSend_WithStream_DeliversMessage(t *testing.T) {
	ch := newTestChannel(t)

	stream := ch.SubscribeStream("session-x")

	ids, err := ch.Send(context.Background(), bus.OutboundMessage{
		Channel: ChannelName,
		ChatID:  "session-x",
		Content: "hello visitor",
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(ids) != 1 || ids[0] == "" {
		t.Fatalf("Send returned ids=%v, want one non-empty id", ids)
	}

	select {
	case got := <-stream:
		if got.Content != "hello visitor" {
			t.Fatalf("received Content=%q, want %q", got.Content, "hello visitor")
		}
		if got.ChatID != "session-x" {
			t.Fatalf("received ChatID=%q, want %q", got.ChatID, "session-x")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive message on stream within 2s")
	}
}

func TestSend_NotRunning_ReturnsErrNotRunning(t *testing.T) {
	mb := bus.NewMessageBus()
	ch := NewChannel(mb, nil)
	// Note: not started.

	_, err := ch.Send(context.Background(), bus.OutboundMessage{
		Channel: ChannelName,
		ChatID:  "session-x",
		Content: "x",
	})
	if err == nil {
		t.Fatal("Send on stopped channel returned nil error")
	}
}

func TestStop_ClosesAllStreams(t *testing.T) {
	mb := bus.NewMessageBus()
	ch := NewChannel(mb, nil)
	if err := ch.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}

	s1 := ch.SubscribeStream("s1")
	s2 := ch.SubscribeStream("s2")

	if err := ch.Stop(context.Background()); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	// Both streams must be drained-and-closed.
	for name, s := range map[string]<-chan bus.OutboundMessage{"s1": s1, "s2": s2} {
		done := make(chan struct{})
		go func() {
			for range s {
			}
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatalf("stream %q did not close after Stop", name)
		}
	}
}
