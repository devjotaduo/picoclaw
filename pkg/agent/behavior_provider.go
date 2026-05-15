package agent

import (
	"github.com/sipeed/picoclaw/pkg/channels"
)

// behaviorProviderAdapter implements channels.BehaviorProvider by delegating to
// the AgentRegistry. The mapping is currently coarse: every (channel, chatID)
// pair resolves to the default agent's Behavior, mirroring picoclaw's
// single-agent-per-instance model (see CLAUDE.md). Per-channel routing can
// extend this later by inspecting `channelName` and selecting an agent.
type behaviorProviderAdapter struct {
	registry *AgentRegistry
}

// NewBehaviorProvider wraps a registry so the channel manager can apply
// runtime behavior filters without importing pkg/agent. Returns nil if the
// registry is nil so callers can pass the result directly to
// channels.WithManagerBehaviorProvider.
func NewBehaviorProvider(registry *AgentRegistry) channels.BehaviorProvider {
	if registry == nil {
		return nil
	}
	return &behaviorProviderAdapter{registry: registry}
}

// ChannelBehavior returns the active filter for an inbound message on
// (channelName, chatID). Returns nil when the default agent has no Behavior
// loaded, which the channel layer interprets as "no filtering".
func (a *behaviorProviderAdapter) ChannelBehavior(channelName, chatID string) *channels.ChannelBehavior {
	if a == nil || a.registry == nil {
		return nil
	}
	inst := a.registry.GetDefaultAgent()
	if inst == nil || inst.Behavior == nil {
		return nil
	}
	b := inst.Behavior
	return &channels.ChannelBehavior{
		MasterEnabled:           b.MasterEnabled,
		RespondInDM:             b.RespondInDM,
		RespondInGroups:         b.RespondInGroups,
		GroupMentionOnly:        b.GroupMentionOnly,
		KeywordTrigger:          b.KeywordTrigger,
		IgnoreOtherBots:         b.IgnoreOtherBots,
		IgnoreForwardedMessages: b.IgnoreForwardedMessages,
		IgnoreSelfMessages:      b.IgnoreSelfMessages,
		ProcessImages:           b.ProcessImages,
		ProcessDocuments:        b.ProcessDocuments,
		ProcessAudio:            b.ProcessAudio,
		ProcessVideo:            b.ProcessVideo,
		ProcessStickers:         b.ProcessStickers,
		ProcessLocation:         b.ProcessLocation,
		MaxMediaSizeMB:          b.MaxMediaSizeMB,
	}
}
