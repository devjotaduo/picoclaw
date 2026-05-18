package litellm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ChatRequest is the OpenAI-compatible payload LiteLLM forwards to whatever
// underlying provider is mapped to `model`. We keep only the fields Clara
// uses; other knobs (presence_penalty, top_p, etc.) can be added later.
type ChatRequest struct {
	Model       string       `json:"model"`
	Messages    []Message    `json:"messages"`
	Tools       []ToolSpec   `json:"tools,omitempty"`
	Stream      bool         `json:"stream"`
	Temperature float64      `json:"temperature,omitempty"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
	User        string       `json:"user,omitempty"` // intake id, for LiteLLM spend tracking
}

// Message is the OpenAI chat-completions message shape. Tool results are
// represented by role="tool" with tool_call_id matching a prior tool_call.id.
type Message struct {
	Role       string     `json:"role"` // "system" | "user" | "assistant" | "tool"
	Content    string     `json:"content,omitempty"`
	Name       string     `json:"name,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// ToolCall is one function invocation the model requested.
type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"` // "function"
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // serialized JSON; LiteLLM never parses it
}

// ToolSpec is opaque here so the package doesn't depend on internal/saas/clara.
// Callers pass the JSON marshal of clara.ToolSpec.
type ToolSpec = json.RawMessage

// StreamEventKind enumerates what a chunk represents to the handler.
type StreamEventKind string

const (
	StreamText      StreamEventKind = "text_delta"
	StreamToolStart StreamEventKind = "tool_start"
	StreamToolArgs  StreamEventKind = "tool_args"
	StreamToolEnd   StreamEventKind = "tool_end"
	StreamDone      StreamEventKind = "done"
	StreamError     StreamEventKind = "error"
)

// StreamEvent is one synthesized event emitted to the caller's callback.
// We translate OpenAI's per-chunk deltas into discrete events so the SSE
// endpoint can forward them to the browser one-for-one without re-parsing.
type StreamEvent struct {
	Kind   StreamEventKind
	Text   string
	Tool   *ToolCall // populated for ToolStart/ToolEnd; Args is delta only
	Args   string    // for ToolArgs: append-only chunk of the function arguments
	Finish string    // for Done: finish_reason ("stop", "tool_calls", "length", ...)
	Err    error     // for Error
}

// ChatStream sends a streaming chat completion to LiteLLM and invokes onEvent
// for each parsed chunk. It returns when the upstream closes the stream
// (sending `data: [DONE]`) or the context is cancelled.
//
// The LiteLLM master key is forwarded as Bearer; LiteLLM then routes to the
// upstream provider (anthropic, openai, etc.) using the per-model config it
// owns. No provider-specific headers leak through this client.
func (c *Client) ChatStream(ctx context.Context, req *ChatRequest, onEvent func(StreamEvent) error) error {
	if onEvent == nil {
		return errors.New("litellm: ChatStream onEvent callback is nil")
	}
	if c.baseURL == "" {
		return errors.New("litellm: base URL not configured (set LITELLM_URL)")
	}
	req.Stream = true

	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal chat request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if c.masterKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.masterKey)
	}

	// Streaming reads need their own client to disable the 30s package-wide
	// timeout — a Clara turn can legitimately stream for >30s with thinking.
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("litellm POST: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		preview, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("litellm status %d: %s", resp.StatusCode, strings.TrimSpace(string(preview)))
	}

	return parseSSEStream(resp.Body, onEvent)
}

// parseSSEStream consumes OpenAI-style chat-completion SSE chunks and emits
// our higher-level StreamEvent. Tool calls arrive as a sequence of deltas:
//   - first chunk has `tool_calls[0].id` + `.function.name`     → emit ToolStart
//   - subsequent chunks have `tool_calls[0].function.arguments` → emit ToolArgs
//   - final chunk has `finish_reason: "tool_calls"`             → emit ToolEnd
//
// Multiple tool calls in parallel are not supported by Anthropic via LiteLLM
// today, so we assume index 0 only.
func parseSSEStream(r io.Reader, onEvent func(StreamEvent) error) error {
	scanner := bufio.NewScanner(r)
	// Allow long SSE frames (tool argument deltas can be large).
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	var (
		pendingToolID   string
		pendingToolName string
		toolOpen        bool
		lastFinish      string // remember finish_reason across chunks so [DONE] preserves it
	)

	emit := func(ev StreamEvent) error {
		if err := onEvent(ev); err != nil {
			return err
		}
		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "[DONE]" {
			if toolOpen {
				_ = emit(StreamEvent{
					Kind: StreamToolEnd,
					Tool: &ToolCall{ID: pendingToolID, Type: "function",
						Function: ToolCallFunction{Name: pendingToolName}},
				})
				toolOpen = false
			}
			return emit(StreamEvent{Kind: StreamDone, Finish: lastFinish})
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int `json:"index"`
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			// Some upstreams emit comment/keepalive lines; ignore non-JSON gracefully.
			continue
		}
		if chunk.Error != nil {
			return emit(StreamEvent{Kind: StreamError, Err: errors.New(chunk.Error.Message)})
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != "" {
				if err := emit(StreamEvent{Kind: StreamText, Text: ch.Delta.Content}); err != nil {
					return err
				}
			}
			for _, tc := range ch.Delta.ToolCalls {
				if tc.ID != "" || tc.Function.Name != "" {
					if toolOpen && pendingToolID != tc.ID && pendingToolID != "" {
						_ = emit(StreamEvent{
							Kind: StreamToolEnd,
							Tool: &ToolCall{ID: pendingToolID, Type: "function",
								Function: ToolCallFunction{Name: pendingToolName}},
						})
					}
					if tc.ID != "" {
						pendingToolID = tc.ID
					}
					if tc.Function.Name != "" {
						pendingToolName = tc.Function.Name
					}
					if !toolOpen {
						toolOpen = true
						if err := emit(StreamEvent{
							Kind: StreamToolStart,
							Tool: &ToolCall{ID: pendingToolID, Type: "function",
								Function: ToolCallFunction{Name: pendingToolName}},
						}); err != nil {
							return err
						}
					}
				}
				if tc.Function.Arguments != "" {
					if err := emit(StreamEvent{Kind: StreamToolArgs, Args: tc.Function.Arguments}); err != nil {
						return err
					}
				}
			}
			if ch.FinishReason != "" {
				lastFinish = ch.FinishReason
				if toolOpen {
					_ = emit(StreamEvent{
						Kind: StreamToolEnd,
						Tool: &ToolCall{ID: pendingToolID, Type: "function",
							Function: ToolCallFunction{Name: pendingToolName}},
					})
					toolOpen = false
				}
				// Don't emit Done here: wait for the [DONE] sentinel so callers
				// see a single terminal event with the captured finish_reason.
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read sse: %w", err)
	}
	return nil
}
