package channels

import (
	"os"
	"path"
	"strings"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/media"
)

// ChannelBehavior is the subset of agent.Behavior the channel layer enforces
// as hard filters BEFORE publishing to the bus. Defined here (not in pkg/agent)
// so pkg/channels does not need to import pkg/agent.
//
// Filters in this struct never need session history. Session-aware filters
// (outbound-only, business hours, throttle, handoff) live in pkg/agent.
type ChannelBehavior struct {
	MasterEnabled           bool
	RespondInDM             bool
	RespondInGroups         bool
	GroupMentionOnly        bool
	KeywordTrigger          string
	IgnoreOtherBots         bool
	IgnoreForwardedMessages bool
	IgnoreSelfMessages      bool
	ProcessImages           bool
	ProcessDocuments        bool
	ProcessAudio            bool
	ProcessVideo            bool
	ProcessStickers         bool
	ProcessLocation         bool
	MaxMediaSizeMB          int
}

// BehaviorProvider supplies the active ChannelBehavior at message-arrival time.
// Implementations may return nil to disable filtering for a particular
// channel+chat (legacy behavior). The provider is called once per inbound
// message, so a lightweight in-memory lookup is appropriate.
type BehaviorProvider interface {
	ChannelBehavior(channelName string, chatID string) *ChannelBehavior
}

// ContextBehaviorProvider lets providers resolve behavior after looking at the
// full inbound context. Multi-agent runtimes use this to choose the same agent
// that the routing layer will use, so channel filters match the target agent's
// behavior.json instead of always using the default agent.
type ContextBehaviorProvider interface {
	ChannelBehaviorForContext(inbound bus.InboundContext) *ChannelBehavior
}

// WithBehaviorProvider injects the provider that BaseChannel.applyBehaviorFilter
// queries on every inbound message. When unset, no behavior filter runs.
func WithBehaviorProvider(p BehaviorProvider) BaseChannelOption {
	return func(c *BaseChannel) { c.behaviorProvider = p }
}

// applyBehaviorFilter evaluates the active ChannelBehavior against an inbound
// message. Returns the (possibly filtered) content+media and a bool indicating
// whether the message should continue down the pipeline. A false return means
// the message must be silently dropped.
//
// Filter order is cheap-first: master switch and chat-type checks short-circuit
// before any media inspection.
func (c *BaseChannel) applyBehaviorFilter(
	content string,
	media []string,
	inboundCtx bus.InboundContext,
	sender bus.SenderInfo,
) (filteredContent string, filteredMedia []string, allow bool) {
	if c.behaviorProvider == nil {
		return content, media, true
	}
	ctxForBehavior := inboundCtx
	if strings.TrimSpace(ctxForBehavior.Channel) == "" {
		ctxForBehavior.Channel = c.name
	}
	var beh *ChannelBehavior
	if contextual, ok := c.behaviorProvider.(ContextBehaviorProvider); ok {
		beh = contextual.ChannelBehaviorForContext(ctxForBehavior)
	} else {
		beh = c.behaviorProvider.ChannelBehavior(c.name, inboundCtx.ChatID)
	}
	if beh == nil {
		return content, media, true
	}

	if !beh.MasterEnabled {
		logger.DebugCF("channels", "Behavior filter: master_enabled=false, dropping",
			map[string]any{"channel": c.name, "chat_id": inboundCtx.ChatID})
		return content, media, false
	}

	switch inboundCtx.ChatType {
	case "direct":
		if !beh.RespondInDM {
			return content, media, false
		}
	case "group", "channel":
		if !beh.RespondInGroups {
			return content, media, false
		}
		if beh.GroupMentionOnly && !inboundCtx.Mentioned {
			return content, media, false
		}
	}

	if beh.IgnoreSelfMessages && sender.IsSelf {
		return content, media, false
	}
	if beh.IgnoreOtherBots && sender.IsBot && !sender.IsSelf {
		return content, media, false
	}
	if beh.IgnoreForwardedMessages && inboundCtx.Forwarded {
		return content, media, false
	}

	if kw := strings.TrimSpace(beh.KeywordTrigger); kw != "" {
		if !strings.Contains(strings.ToLower(content), strings.ToLower(kw)) {
			return content, media, false
		}
	}

	filteredContent, filteredMedia = filterMediaByBehavior(content, media, beh, c.mediaStore)
	if filteredContent == "" && len(filteredMedia) == 0 {
		return filteredContent, filteredMedia, false
	}
	return filteredContent, filteredMedia, true
}

// filterMediaByBehavior strips media refs whose type is disabled and rewrites
// the audio annotation when ProcessAudio is false. Size limits drop refs whose
// stored size exceeds MaxMediaSizeMB.
func filterMediaByBehavior(
	content string,
	mediaRefs []string,
	beh *ChannelBehavior,
	store media.MediaStore,
) (string, []string) {
	// Audio is special: when a voice message arrives, the channel annotates
	// content with [voice] or [audio:...] markers (see audioAnnotationRe in
	// base.go) and may also publish a media ref. If audio is disabled we drop
	// BOTH so the LLM never sees a transcription request stub.
	if !beh.ProcessAudio {
		content = audioAnnotationRe.ReplaceAllString(content, "")
		content = strings.TrimSpace(content)
	}

	if len(mediaRefs) == 0 {
		return content, mediaRefs
	}

	maxBytes := int64(beh.MaxMediaSizeMB) * 1024 * 1024

	kept := make([]string, 0, len(mediaRefs))
	for _, ref := range mediaRefs {
		mediaType, localPath := classifyMediaRef(ref, store)
		if !behaviorAllowsMediaType(beh, mediaType) {
			continue
		}
		if maxBytes > 0 && localPath != "" {
			if info, err := os.Stat(localPath); err == nil && info.Size() > maxBytes {
				logger.DebugCF("channels", "Behavior filter: media exceeds max_media_size_mb, dropping",
					map[string]any{"ref": ref, "size": info.Size(), "max": maxBytes})
				continue
			}
		}
		kept = append(kept, ref)
	}
	return content, kept
}

// classifyMediaRef returns a coarse media type label (image|document|audio|
// video|sticker|location|other) for a media ref AND the resolved local path
// (empty if the store couldn't resolve it). Uses the MediaStore ContentType
// when available, else falls back to file-extension heuristics on the ref.
func classifyMediaRef(ref string, store media.MediaStore) (string, string) {
	contentType := ""
	localPath := ""
	if store != nil {
		if lp, meta, err := store.ResolveWithMeta(ref); err == nil {
			contentType = meta.ContentType
			localPath = lp
		}
	}
	mediaType := classifyByMIMEAndExt(ref, contentType)
	return mediaType, localPath
}

// classifyByMIMEAndExt is a pure helper (no I/O) that maps a content-type and
// ref to a coarse media type label.
func classifyByMIMEAndExt(ref, contentType string) string {
	ctLower := strings.ToLower(contentType)
	switch {
	case strings.HasPrefix(ctLower, "image/webp"):
		if strings.Contains(strings.ToLower(ref), "sticker") {
			return "sticker"
		}
		return "image"
	case strings.HasPrefix(ctLower, "image/gif"):
		return "sticker"
	case strings.HasPrefix(ctLower, "image/"):
		return "image"
	case strings.HasPrefix(ctLower, "audio/"):
		return "audio"
	case strings.HasPrefix(ctLower, "video/"):
		return "video"
	case ctLower == "application/pdf",
		strings.Contains(ctLower, "officedocument"),
		strings.Contains(ctLower, "msword"),
		strings.Contains(ctLower, "ms-excel"),
		strings.Contains(ctLower, "ms-powerpoint"),
		ctLower == "text/csv":
		return "document"
	}

	ext := strings.ToLower(path.Ext(ref))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp":
		return "image"
	case ".gif":
		return "sticker"
	case ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac":
		return "audio"
	case ".mp4", ".mov", ".webm", ".avi", ".mkv":
		return "video"
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv":
		return "document"
	}

	lowered := strings.ToLower(ref)
	if strings.Contains(lowered, "location") {
		return "location"
	}
	if strings.Contains(lowered, "sticker") {
		return "sticker"
	}
	return "other"
}

func behaviorAllowsMediaType(beh *ChannelBehavior, mediaType string) bool {
	switch mediaType {
	case "image":
		return beh.ProcessImages
	case "document":
		return beh.ProcessDocuments
	case "audio":
		return beh.ProcessAudio
	case "video":
		return beh.ProcessVideo
	case "sticker":
		return beh.ProcessStickers
	case "location":
		return beh.ProcessLocation
	}
	// Unknown types pass — channel-side classification is best-effort and we
	// would rather let unfamiliar media through than over-drop.
	return true
}
