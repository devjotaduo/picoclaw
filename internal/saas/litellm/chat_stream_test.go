package litellm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestChatStream_ParsesTextAndToolCalls fakes a LiteLLM upstream emitting an
// OpenAI-compatible chat-completions SSE stream. It must produce the events
// our SSE handler relies on: interleaved text deltas and one bracketed tool
// call sequence (Start → Args... → End → Done).
func TestChatStream_ParsesTextAndToolCalls(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher := w.(http.Flusher)

		writeChunk := func(payload string) {
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		}
		writeChunk(`{"choices":[{"delta":{"content":"Oi! "}}]}`)
		writeChunk(`{"choices":[{"delta":{"content":"Como te chamo?"}}]}`)
		writeChunk(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"set_identity"}}]}}]}`)
		writeChunk(`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"contact_"}}]}}]}`)
		writeChunk(`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"name\":\"Eduardo\"}"}}]}}]}`)
		writeChunk(`{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`)
		writeChunk(`[DONE]`)
	}))
	defer upstream.Close()

	c := NewClient(upstream.URL, "test-master-key")

	var (
		text      strings.Builder
		toolName  string
		toolArgs  strings.Builder
		gotEnd    bool
		gotDone   bool
		gotFinish string
	)

	err := c.ChatStream(context.Background(), &ChatRequest{
		Model: "claude-sonnet-4.6",
		Messages: []Message{
			{Role: "user", Content: "oi"},
		},
	}, func(ev StreamEvent) error {
		switch ev.Kind {
		case StreamText:
			text.WriteString(ev.Text)
		case StreamToolStart:
			toolName = ev.Tool.Function.Name
		case StreamToolArgs:
			toolArgs.WriteString(ev.Args)
		case StreamToolEnd:
			gotEnd = true
		case StreamDone:
			gotDone = true
			gotFinish = ev.Finish
		}
		return nil
	})
	if err != nil {
		t.Fatalf("ChatStream: %v", err)
	}

	if text.String() != "Oi! Como te chamo?" {
		t.Fatalf("text = %q", text.String())
	}
	if toolName != "set_identity" {
		t.Fatalf("toolName = %q", toolName)
	}
	if toolArgs.String() != `{"contact_name":"Eduardo"}` {
		t.Fatalf("toolArgs = %q", toolArgs.String())
	}
	if !gotEnd {
		t.Fatal("missing tool_end")
	}
	if !gotDone || gotFinish != "tool_calls" {
		t.Fatalf("done=%v finish=%q", gotDone, gotFinish)
	}
}

func TestChatStream_PropagatesUpstreamError(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"upstream down"}`))
	}))
	defer upstream.Close()

	c := NewClient(upstream.URL, "k")
	err := c.ChatStream(context.Background(), &ChatRequest{Model: "x", Messages: []Message{{Role: "user", Content: "hi"}}},
		func(StreamEvent) error { return nil })
	if err == nil || !strings.Contains(err.Error(), "502") {
		t.Fatalf("expected status 502 error, got %v", err)
	}
}

func TestChatStream_RejectsMissingBaseURL(t *testing.T) {
	c := NewClient("", "k")
	err := c.ChatStream(context.Background(), &ChatRequest{Model: "x"}, func(StreamEvent) error { return nil })
	if err == nil {
		t.Fatal("expected error when base URL empty")
	}
}
