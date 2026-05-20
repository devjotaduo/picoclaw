package asr

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/pkg/config"
)

func TestWhisperTranscriberTranscribeDataUsesConfiguredModel(t *testing.T) {
	var gotModel string
	var gotPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if got := r.Header.Get("Authorization"); got != "Bearer sk-openai-test" {
			t.Errorf("Authorization = %q, want %q", got, "Bearer sk-openai-test")
		}

		reader, err := r.MultipartReader()
		if err != nil {
			t.Fatalf("MultipartReader() error: %v", err)
		}

		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatalf("NextPart() error: %v", err)
			}

			data, err := io.ReadAll(part)
			if err != nil {
				t.Fatalf("ReadAll() error: %v", err)
			}

			if part.FormName() == "model" {
				gotModel = string(data)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(TranscriptionResponse{Text: "hello from whisper"}); err != nil {
			t.Fatalf("Encode() error: %v", err)
		}
	}))
	defer server.Close()

	tr := NewWhisperTranscriber(&config.ModelConfig{
		Model:   "openai/whisper-1",
		APIBase: server.URL,
		APIKeys: config.SimpleSecureStrings("sk-openai-test"),
	})
	tr.httpClient = server.Client()

	resp, err := tr.TranscribeData(context.Background(), []byte("audio"), "clip.ogg")
	if err != nil {
		t.Fatalf("TranscribeData() error: %v", err)
	}
	if resp.Text != "hello from whisper" {
		t.Errorf("Text = %q, want %q", resp.Text, "hello from whisper")
	}
	if gotModel != "whisper-1" {
		t.Errorf("model field = %q, want %q", gotModel, "whisper-1")
	}
	if gotPath != "/audio/transcriptions" {
		t.Errorf("path = %q, want %q", gotPath, "/audio/transcriptions")
	}
}

func TestWhisperTranscriberOpenRouterUsesJSONInputAudio(t *testing.T) {
	var gotModel string
	var gotFormat string
	var gotAudio string
	var gotPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if got := r.Header.Get("Authorization"); got != "Bearer sk-openrouter-test" {
			t.Errorf("Authorization = %q, want %q", got, "Bearer sk-openrouter-test")
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", got)
		}

		var payload struct {
			InputAudio struct {
				Data   string `json:"data"`
				Format string `json:"format"`
			} `json:"input_audio"`
			Model string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode() error: %v", err)
		}
		gotModel = payload.Model
		gotFormat = payload.InputAudio.Format
		gotAudio = payload.InputAudio.Data

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(TranscriptionResponse{Text: "ola do openrouter"}); err != nil {
			t.Fatalf("Encode() error: %v", err)
		}
	}))
	defer server.Close()

	tr := NewWhisperTranscriber(&config.ModelConfig{
		Provider: "openrouter",
		Model:    "openai/whisper-1",
		APIBase:  server.URL,
		APIKeys:  config.SimpleSecureStrings("sk-openrouter-test"),
	})
	tr.httpClient = server.Client()

	resp, err := tr.TranscribeData(context.Background(), []byte("audio"), "clip.webm")
	if err != nil {
		t.Fatalf("TranscribeData() error: %v", err)
	}
	if resp.Text != "ola do openrouter" {
		t.Errorf("Text = %q, want %q", resp.Text, "ola do openrouter")
	}
	if gotModel != "openai/whisper-1" {
		t.Errorf("model field = %q, want %q", gotModel, "openai/whisper-1")
	}
	if gotFormat != "webm" {
		t.Errorf("format = %q, want webm", gotFormat)
	}
	if gotAudio != "YXVkaW8=" {
		t.Errorf("audio data = %q, want base64 audio", gotAudio)
	}
	if gotPath != "/audio/transcriptions" {
		t.Errorf("path = %q, want %q", gotPath, "/audio/transcriptions")
	}
}

func TestWhisperTranscriberUsesEndpointAPIBaseWithoutDoubleAppend(t *testing.T) {
	var gotPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(TranscriptionResponse{Text: "ok"}); err != nil {
			t.Fatalf("Encode() error: %v", err)
		}
	}))
	defer server.Close()

	tr := NewWhisperTranscriber(&config.ModelConfig{
		Model:   "groq/whisper-large-v3",
		APIBase: server.URL + "/audio/transcriptions",
		APIKeys: config.SimpleSecureStrings("sk-groq-test"),
	})
	tr.httpClient = server.Client()

	if _, err := tr.TranscribeData(context.Background(), []byte("audio"), "clip.ogg"); err != nil {
		t.Fatalf("TranscribeData() error: %v", err)
	}
	if gotPath != "/audio/transcriptions" {
		t.Errorf("path = %q, want %q", gotPath, "/audio/transcriptions")
	}
}
