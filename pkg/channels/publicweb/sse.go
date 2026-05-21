package publicweb

import (
	"encoding/json"
	"fmt"
	"io"
)

// SSE helpers used by the Phase 5 HTTP handler. They are intentionally
// small and dependency-free so the handler can compose them however it
// wants (e.g. mixing keepalives with real events on a single
// http.ResponseWriter). Each helper performs at most one Write to the
// underlying writer and does NOT flush — flushing is the handler's
// responsibility (it knows whether the underlying writer is an
// http.Flusher).
//
// All helpers follow the SSE wire format defined by RFC-spec
// EventSource / WHATWG HTML §9.2.6:
//
//	event: <event>\n
//	data:  <payload>\n
//	\n
//
// Payloads that contain newlines are split into multiple "data:" lines
// so the client reassembles them correctly.

// WriteSSEEvent writes a single SSE event with the given event name and
// raw string payload. The payload is split on "\n" into multiple
// "data:" lines, as required by the SSE spec for multi-line messages.
func WriteSSEEvent(w io.Writer, event, payload string) error {
	if _, err := fmt.Fprintf(w, "event: %s\n", event); err != nil {
		return err
	}
	// Split on '\n' so embedded newlines do not break the SSE framing.
	start := 0
	for i := 0; i < len(payload); i++ {
		if payload[i] == '\n' {
			if _, err := fmt.Fprintf(w, "data: %s\n", payload[start:i]); err != nil {
				return err
			}
			start = i + 1
		}
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", payload[start:]); err != nil {
		return err
	}
	return nil
}

// WriteSSEJSON marshals v to JSON and writes it as the data payload of a
// single SSE event.
func WriteSSEJSON(w io.Writer, event string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("publicweb: marshal sse payload: %w", err)
	}
	return WriteSSEEvent(w, event, string(data))
}

// WriteKeepalive writes an SSE comment line. SSE comments start with ":"
// and are ignored by EventSource clients, but they keep intermediate
// proxies from closing an idle long-poll connection.
func WriteKeepalive(w io.Writer) error {
	_, err := fmt.Fprint(w, ": keepalive\n\n")
	return err
}
