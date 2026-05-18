package agent

import (
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/sipeed/picoclaw/pkg/audio/asr"
	"github.com/sipeed/picoclaw/pkg/bus"
)

type recordingAudioTranscriber struct {
	text string
	path string
}

func (t *recordingAudioTranscriber) Name() string { return "recording" }

func (t *recordingAudioTranscriber) Transcribe(ctx context.Context, audioFilePath string) (*asr.TranscriptionResponse, error) {
	t.path = audioFilePath
	return &asr.TranscriptionResponse{Text: t.text}, nil
}

func TestTranscribeAudioInMessage_InlineAudioDataURL(t *testing.T) {
	encodedAudio := base64.StdEncoding.EncodeToString([]byte("fake audio"))
	transcriber := &recordingAudioTranscriber{text: "hello from audio"}
	al := &AgentLoop{transcriber: transcriber}

	got, ok := al.transcribeAudioInMessage(context.Background(), bus.InboundMessage{
		Content: "[audio]",
		Media:   []string{"data:audio/webm;codecs=opus;base64," + encodedAudio},
	})
	if !ok {
		t.Fatal("transcribeAudioInMessage() ok = false, want true")
	}
	if got.Content != "[voice: hello from audio]" {
		t.Fatalf("Content = %q, want transcribed voice annotation", got.Content)
	}
	if len(got.Media) != 0 {
		t.Fatalf("Media = %#v, want consumed audio media", got.Media)
	}
	if filepath.Ext(transcriber.path) != ".webm" {
		t.Fatalf("transcriber path = %q, want .webm temp file", transcriber.path)
	}
	if _, err := os.Stat(transcriber.path); !os.IsNotExist(err) {
		t.Fatalf("temporary inline audio still exists after transcription: %v", err)
	}
}

func TestTranscribeAudioInMessage_AppendsInlineAudioWithoutLeadingNewline(t *testing.T) {
	encodedAudio := base64.StdEncoding.EncodeToString([]byte("fake audio"))
	al := &AgentLoop{transcriber: &recordingAudioTranscriber{text: "standalone transcript"}}

	got, ok := al.transcribeAudioInMessage(context.Background(), bus.InboundMessage{
		Media: []string{"data:audio/ogg;base64," + encodedAudio},
	})
	if !ok {
		t.Fatal("transcribeAudioInMessage() ok = false, want true")
	}
	if got.Content != "[voice: standalone transcript]" {
		t.Fatalf("Content = %q, want annotation without leading newline", got.Content)
	}
}
