package utils

import "testing"

func TestAudioFormatSupportsBrowserRecordings(t *testing.T) {
	tests := map[string]string{
		"recording.webm": "webm",
		"voice.opus":     "opus",
		"clip.oga":       "oga",
	}

	for path, want := range tests {
		got, err := AudioFormat(path)
		if err != nil {
			t.Fatalf("AudioFormat(%q) error = %v", path, err)
		}
		if got != want {
			t.Fatalf("AudioFormat(%q) = %q, want %q", path, got, want)
		}
	}
}
