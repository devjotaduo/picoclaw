package agent

import (
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
)

// registrySource is a lightweight interface so behaviorProviderAdapter can
// fetch the *current* registry from the AgentLoop on every call, picking up
// behavior changes written by template-apply + gateway reload without needing
// a full process restart.
type registrySource interface {
	GetRegistry() *AgentRegistry
}

// behaviorProviderAdapter implements channels.BehaviorProvider by delegating to
// the AgentLoop. Querying the loop (not a fixed registry snapshot) ensures
// that post-reload behavior changes are reflected immediately.
type behaviorProviderAdapter struct {
	source registrySource
}

// NewBehaviorProvider wraps an AgentLoop so the channel manager can apply
// runtime behavior filters without importing pkg/agent. Returns nil if the
// loop is nil so callers can pass the result directly to
// channels.WithManagerBehaviorProvider.
func NewBehaviorProvider(loop *AgentLoop) channels.BehaviorProvider {
	if loop == nil {
		return nil
	}
	return &behaviorProviderAdapter{source: loop}
}

// ChannelBehavior returns the active filter for an inbound message on
// (channelName, chatID). Legacy callers without a full inbound context fall
// back to normal route resolution with the available fields.
func (a *behaviorProviderAdapter) ChannelBehavior(channelName, chatID string) *channels.ChannelBehavior {
	return a.ChannelBehaviorForContext(bus.InboundContext{Channel: channelName, ChatID: chatID})
}

// ChannelBehaviorForContext returns the active filter for the routed target
// agent. This keeps cheap channel-layer filters aligned with the same
// agents.dispatch.rules decision that the agent loop will use for the turn.
func (a *behaviorProviderAdapter) ChannelBehaviorForContext(inbound bus.InboundContext) *channels.ChannelBehavior {
	if a == nil || a.source == nil {
		return nil
	}
	registry := a.source.GetRegistry()
	if registry == nil {
		return nil
	}
	route := registry.ResolveRoute(inbound)
	inst, ok := registry.GetAgent(route.AgentID)
	if !ok {
		inst = registry.GetDefaultAgent()
	}
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
