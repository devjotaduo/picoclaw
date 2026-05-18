package asr

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
	"github.com/sipeed/picoclaw/pkg/utils"
)

type QwenASRTranscriber struct {
	apiKey     string
	apiBase    string
	modelID    string
	httpClient *http.Client
}

func NewQwenASRTranscriber(modelCfg *config.ModelConfig) *QwenASRTranscriber {
	if modelCfg == nil {
		return nil
	}

	_, modelID := providers.ExtractProtocol(modelCfg)
	if modelID == "" {
		modelID = strings.TrimSpace(modelCfg.Model)
	}
	if modelID == "" {
		return nil
	}

	tr := &QwenASRTranscriber{
		apiKey:  modelCfg.APIKey(),
		apiBase: strings.TrimRight(providers.ResolveAPIBase(modelCfg), "/"),
		modelID: modelID,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}

	logger.DebugCF("voice", "Creating Qwen ASR transcriber", map[string]any{
		"api_base": tr.apiBase,
		"has_key":  tr.apiKey != "",
		"model":    tr.modelID,
	})
	return tr
}

func (t *QwenASRTranscriber) Transcribe(ctx context.Context, audioFilePath string) (*TranscriptionResponse, error) {
	logger.InfoCF("voice", "Starting Qwen ASR transcription", map[string]any{
		"audio_file": audioFilePath,
		"model":      t.modelID,
	})

	audioBytes, err := os.ReadFile(audioFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}

	format, err := utils.AudioFormat(audioFilePath)
	if err != nil {
		return nil, err
	}

	dataURI := fmt.Sprintf("data:%s;base64,%s", qwenAudioMIME(format), base64.StdEncoding.EncodeToString(audioBytes))
	body := map[string]any{
		"model": t.modelID,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "input_audio",
						"input_audio": map[string]any{
							"data": dataURI,
						},
					},
				},
			},
		},
		"asr_options": map[string]any{
			"enable_itn": false,
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Qwen ASR request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", t.apiBase+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to create Qwen ASR request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if t.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+t.apiKey)
	}

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send Qwen ASR request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Qwen ASR response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		logger.ErrorCF("voice", "Qwen ASR API error", map[string]any{
			"status_code": resp.StatusCode,
			"response":    string(respBody),
		})
		return nil, fmt.Errorf("Qwen ASR API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	text, err := parseQwenASRText(respBody)
	if err != nil {
		return nil, err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("Qwen ASR returned empty transcript")
	}

	logger.InfoCF("voice", "Qwen ASR transcription completed successfully", map[string]any{
		"text_length":           len(text),
		"transcription_preview": utils.Truncate(text, 50),
	})
	return &TranscriptionResponse{Text: text}, nil
}

func (t *QwenASRTranscriber) Name() string {
	return "qwen-asr"
}

func parseQwenASRText(body []byte) (string, error) {
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("failed to parse Qwen ASR response: %w", err)
	}
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("Qwen ASR response had no choices")
	}
	return response.Choices[0].Message.Content, nil
}

func qwenAudioMIME(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "mp3", "mpeg":
		return "audio/mpeg"
	case "m4a":
		return "audio/mp4"
	case "wav":
		return "audio/wav"
	case "ogg", "oga":
		return "audio/ogg"
	case "webm":
		return "audio/webm"
	case "opus":
		return "audio/opus"
	case "flac":
		return "audio/flac"
	case "aac":
		return "audio/aac"
	default:
		return "audio/" + format
	}
}
