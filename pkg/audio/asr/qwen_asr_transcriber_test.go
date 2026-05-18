package asr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/pkg/config"
)

func TestQwenASRTranscriberSendsDataURI(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Fatalf("path = %q, want /chat/completions", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer sk-test" {
			t.Fatalf("Authorization = %q, want bearer key", auth)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("Decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"olá mundo"}}]}`))
	}))
	defer server.Close()

	audioPath := filepath.Join(t.TempDir(), "recording.webm")
	if err := os.WriteFile(audioPath, []byte("fake audio"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	tr := NewQwenASRTranscriber(&config.ModelConfig{
		ModelName: "qwen-asr",
		Provider:  "qwen-intl",
		Model:     "qwen3-asr-flash",
		APIBase:   server.URL,
		APIKeys:   config.SimpleSecureStrings("sk-test"),
	})
	result, err := tr.Transcribe(t.Context(), audioPath)
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if result.Text != "olá mundo" {
		t.Fatalf("Text = %q, want olá mundo", result.Text)
	}
	if gotBody["model"] != "qwen3-asr-flash" {
		t.Fatalf("model = %#v, want qwen3-asr-flash", gotBody["model"])
	}
	if _, ok := gotBody["asr_options"].(map[string]any); !ok {
		t.Fatalf("asr_options = %#v, want object", gotBody["asr_options"])
	}

	messages := gotBody["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	inputAudio := content[0].(map[string]any)["input_audio"].(map[string]any)
	dataURI, _ := inputAudio["data"].(string)
	if wantPrefix := "data:audio/webm;base64,"; len(dataURI) <= len(wantPrefix) || dataURI[:len(wantPrefix)] != wantPrefix {
		t.Fatalf("input_audio data = %q, want %s prefix", dataURI, wantPrefix)
	}
}

func TestLooksLikeAudioTranscriptionRefusal(t *testing.T) {
	if !looksLikeAudioTranscriptionRefusal("I can't transcribe audio directly since I don't have access to audio files.") {
		t.Fatal("expected English refusal to be detected")
	}
	if !looksLikeAudioTranscriptionRefusal("Não consigo transcrever áudio diretamente.") {
		t.Fatal("expected Portuguese refusal to be detected")
	}
	if looksLikeAudioTranscriptionRefusal("preciso de 20 sacos de cimento") {
		t.Fatal("unexpected refusal match for normal transcript")
	}
}
