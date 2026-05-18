// PicoClaw - Ultra-lightweight personal AI agent

package agent

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
	"github.com/sipeed/picoclaw/pkg/utils"
)

func (al *AgentLoop) transcribeAudioInMessage(ctx context.Context, msg bus.InboundMessage) (bus.InboundMessage, bool) {
	if al.transcriber == nil || len(msg.Media) == 0 {
		return msg, false
	}

	// Transcribe each audio media ref in order.
	var transcriptions []string
	var keptMedia []string
	for _, ref := range msg.Media {
		path, meta, cleanup, handled, err := al.resolveAudioMediaForTranscription(ref)
		if cleanup != nil {
			defer cleanup()
		}
		if !handled {
			keptMedia = append(keptMedia, ref)
			continue
		}
		if err != nil {
			logger.WarnCF("voice", "Failed to resolve media ref", map[string]any{"ref": ref, "error": err})
			keptMedia = append(keptMedia, ref)
			continue
		}
		if !utils.IsAudioFile(meta.Filename, meta.ContentType) {
			keptMedia = append(keptMedia, ref)
			continue
		}
		result, err := al.transcriber.Transcribe(ctx, path)
		if err != nil {
			logger.WarnCF("voice", "Transcription failed", map[string]any{"ref": ref, "error": err})
			transcriptions = append(transcriptions, "")
			keptMedia = append(keptMedia, ref)
			continue
		}
		transcriptions = append(transcriptions, result.Text)
	}

	if len(transcriptions) == 0 {
		return msg, false
	}

	al.sendTranscriptionFeedback(ctx, msg.Channel, msg.ChatID, msg.MessageID, transcriptions)

	// Replace audio annotations sequentially with transcriptions.
	idx := 0
	newContent := audioAnnotationRe.ReplaceAllStringFunc(msg.Content, func(match string) string {
		if idx >= len(transcriptions) {
			return match
		}
		text := transcriptions[idx]
		idx++
		if text == "" {
			return match
		}
		return "[voice: " + text + "]"
	})

	// Append any remaining transcriptions not matched by an annotation.
	for ; idx < len(transcriptions); idx++ {
		if transcriptions[idx] != "" {
			newContent = appendVoiceTranscription(newContent, transcriptions[idx])
		}
	}

	msg.Content = newContent
	msg.Media = keptMedia
	return msg, true
}

type audioMediaForTranscription struct {
	path string
	meta media.MediaMeta
}

func (al *AgentLoop) resolveAudioMediaForTranscription(ref string) (
	path string,
	meta media.MediaMeta,
	cleanup func(),
	handled bool,
	err error,
) {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(ref, "data:audio/") {
		audio, parseErr := writeInlineAudioToTemp(ref)
		if parseErr != nil {
			return "", media.MediaMeta{}, nil, true, parseErr
		}
		return audio.path, audio.meta, func() {
			if removeErr := os.Remove(audio.path); removeErr != nil && !os.IsNotExist(removeErr) {
				logger.WarnCF("voice", "Failed to remove temporary inline audio", map[string]any{
					"path":  audio.path,
					"error": removeErr.Error(),
				})
			}
		}, true, nil
	}

	if !strings.HasPrefix(ref, "media://") {
		return "", media.MediaMeta{}, nil, false, nil
	}
	if al.mediaStore == nil {
		return "", media.MediaMeta{}, nil, true, fmt.Errorf("media store is not configured")
	}

	path, meta, err = al.mediaStore.ResolveWithMeta(ref)
	return path, meta, nil, true, err
}

type inlineAudioData struct {
	contentType string
	data        []byte
	extension   string
}

func writeInlineAudioToTemp(mediaURL string) (audioMediaForTranscription, error) {
	parsed, err := parseInlineAudioDataURL(mediaURL)
	if err != nil {
		return audioMediaForTranscription{}, err
	}

	dir := media.TempDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return audioMediaForTranscription{}, fmt.Errorf("create media temp dir: %w", err)
	}

	file, err := os.CreateTemp(dir, "inline-audio-*"+parsed.extension)
	if err != nil {
		return audioMediaForTranscription{}, fmt.Errorf("create inline audio temp file: %w", err)
	}
	path := file.Name()
	if _, err := file.Write(parsed.data); err != nil {
		file.Close()
		os.Remove(path)
		return audioMediaForTranscription{}, fmt.Errorf("write inline audio temp file: %w", err)
	}
	if err := file.Close(); err != nil {
		os.Remove(path)
		return audioMediaForTranscription{}, fmt.Errorf("close inline audio temp file: %w", err)
	}

	return audioMediaForTranscription{
		path: path,
		meta: media.MediaMeta{
			Filename:    filepath.Base(path),
			ContentType: parsed.contentType,
			Source:      "inline-audio",
		},
	}, nil
}

func parseInlineAudioDataURL(mediaURL string) (inlineAudioData, error) {
	header, data, found := strings.Cut(strings.TrimSpace(mediaURL), ",")
	if !found || strings.TrimSpace(data) == "" {
		return inlineAudioData{}, fmt.Errorf("audio data URL is malformed")
	}
	if !strings.HasPrefix(header, "data:audio/") {
		return inlineAudioData{}, fmt.Errorf("media is not inline audio")
	}
	if !strings.Contains(header, ";base64") {
		return inlineAudioData{}, fmt.Errorf("audio data URL must be base64 encoded")
	}

	contentType := strings.TrimPrefix(header, "data:")
	contentType = strings.TrimSuffix(contentType, ";base64")
	contentType = strings.TrimSpace(contentType)
	mimeType, _, _ := strings.Cut(contentType, ";")
	mimeType = strings.TrimSpace(strings.ToLower(mimeType))

	extension, ok := inlineAudioExtension(mimeType)
	if !ok {
		return inlineAudioData{}, fmt.Errorf("unsupported inline audio format: %s", contentType)
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(data))
	if err != nil {
		return inlineAudioData{}, fmt.Errorf("invalid inline audio base64 data")
	}

	return inlineAudioData{
		contentType: contentType,
		data:        decoded,
		extension:   extension,
	}, nil
}

func inlineAudioExtension(mimeType string) (string, bool) {
	switch mimeType {
	case "audio/webm":
		return ".webm", true
	case "audio/ogg", "application/ogg", "application/x-ogg":
		return ".ogg", true
	case "audio/mpeg", "audio/mp3":
		return ".mp3", true
	case "audio/mp4", "audio/x-m4a":
		return ".m4a", true
	case "audio/wav", "audio/x-wav", "audio/wave":
		return ".wav", true
	case "audio/flac":
		return ".flac", true
	case "audio/aac":
		return ".aac", true
	case "audio/opus":
		return ".opus", true
	default:
		return "", false
	}
}

func appendVoiceTranscription(content, text string) string {
	annotation := "[voice: " + text + "]"
	if strings.TrimSpace(content) == "" {
		return annotation
	}
	return content + "\n" + annotation
}

func (al *AgentLoop) sendTranscriptionFeedback(
	ctx context.Context,
	channel, chatID, messageID string,
	validTexts []string,
) {
	if al.cfg == nil || !al.cfg.Voice.EchoTranscription {
		return
	}
	if al.channelManager == nil {
		return
	}

	var nonEmpty []string
	for _, t := range validTexts {
		if t != "" {
			nonEmpty = append(nonEmpty, t)
		}
	}

	var feedbackMsg string
	if len(nonEmpty) > 0 {
		feedbackMsg = "Transcript: " + strings.Join(nonEmpty, "\n")
	} else {
		feedbackMsg = "No voice detected in the audio"
	}

	err := al.channelManager.SendMessage(ctx, bus.OutboundMessage{
		Context:          bus.NewOutboundContext(channel, chatID, messageID),
		Content:          feedbackMsg,
		ReplyToMessageID: messageID,
	})
	if err != nil {
		logger.WarnCF("voice", "Failed to send transcription feedback", map[string]any{"error": err.Error()})
	}
}
