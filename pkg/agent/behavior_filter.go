package agent

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/bus"
	runtimeevents "github.com/sipeed/picoclaw/pkg/events"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/providers"
)

// KindBehaviorHandoffRequested is published when a handoff_keywords match drops
// an inbound message in favor of escalating to a human operator. Downstream
// integrations (Slack notifiers, CRM webhooks) can subscribe to this event.
const KindBehaviorHandoffRequested runtimeevents.Kind = "behavior.handoff_requested"

// piiPatterns matches Brazilian-flavored PII the agent must redact in outbound
// replies when mask_pii_in_replies is enabled. These deliberately err toward
// over-matching: CPF is 11 digits with optional punctuation; phone is 8-11
// digits in common BR layouts; email is the standard local@domain shape.
var piiPatterns = []*regexp.Regexp{
	// CPF: 000.000.000-00 or 11 digits, with word boundaries to avoid eating
	// random 11-digit numeric runs inside other tokens.
	regexp.MustCompile(`\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b`),
	// Brazilian phone numbers: optional country code +55, optional area code
	// with parentheses, 8 or 9 digits.
	regexp.MustCompile(`(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b`),
	// Email
	regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`),
}

// applyOutboundPIIMask redacts PII patterns when the session's agent has
// MaskPIIInReplies=true. Returns content unchanged otherwise.
func (al *AgentLoop) applyOutboundPIIMask(sessionKey, content string) string {
	if content == "" || sessionKey == "" {
		return content
	}
	inst := al.agentForSession(sessionKey)
	if inst == nil || inst.Behavior == nil || !inst.Behavior.MaskPIIInReplies {
		return content
	}
	return maskPII(content)
}

// maskPII replaces PII matches with "***". Defined separately so unit tests
// can exercise it without spinning up an AgentLoop.
func maskPII(content string) string {
	for _, re := range piiPatterns {
		content = re.ReplaceAllString(content, "***")
	}
	return content
}

// passesSessionBehavior evaluates the session-aware behavior filters that
// could not run at the channel layer:
//
//   - business_hours_only (with optional out_of_hours_reply auto-response)
//   - outbound_only_mode (requires inspecting session history)
//   - max_messages_per_session (requires counting history entries)
//
// Returns false when the message must be silently dropped — including the case
// where an out-of-hours reply was sent in lieu of starting a real turn. The
// session-claim placeholder in agent.go must NOT be installed when this
// returns false, so callers MUST check the return value before claiming.
func (al *AgentLoop) passesSessionBehavior(
	ctx context.Context,
	msg bus.InboundMessage,
	sessionKey string,
) bool {
	inst := al.agentForSession(sessionKey)
	if inst == nil || inst.Behavior == nil {
		return true
	}
	beh := inst.Behavior

	if beh.BusinessHoursOnly && !beh.WithinSchedule(time.Now()) {
		logger.DebugCF("agent", "Behavior filter: outside business hours, dropping",
			map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "session": sessionKey})
		if reply := beh.OutOfHoursReply; reply != "" {
			al.publishOutOfHoursReply(ctx, msg, reply)
		}
		return false
	}

	needsHistory := beh.OutboundOnlyMode || beh.MaxMessagesPerSession > 0
	var history []providers.Message
	if needsHistory && inst.Sessions != nil {
		history = inst.Sessions.GetHistory(sessionKey)
	}

	if beh.OutboundOnlyMode {
		if !lastAssistantInHistory(history) {
			logger.DebugCF("agent", "Behavior filter: outbound_only_mode, user initiated — dropping",
				map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "session": sessionKey})
			return false
		}
	}

	if beh.MaxMessagesPerSession > 0 {
		if countUserMessages(history) >= beh.MaxMessagesPerSession {
			logger.DebugCF("agent", "Behavior filter: max_messages_per_session reached, dropping",
				map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "session": sessionKey, "limit": beh.MaxMessagesPerSession})
			return false
		}
	}

	// Per-sender throttle: cooldown + sliding-window rate limit. The bucket key
	// is the sender ID so different users get independent buckets.
	if beh.MaxMessagesPerMinutePerUser > 0 || beh.ResponseCooldownSeconds > 0 {
		al.mu.Lock()
		if al.behaviorThrottle == nil {
			al.behaviorThrottle = newBehaviorThrottle()
		}
		thr := al.behaviorThrottle
		al.mu.Unlock()
		if !thr.Allow(msg.SenderID, beh.MaxMessagesPerMinutePerUser, beh.ResponseCooldownSeconds) {
			logger.DebugCF("agent", "Behavior filter: throttled, dropping",
				map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "sender": msg.SenderID})
			return false
		}
	}

	// Handoff keyword detection — fire-and-forget signal. We still drop the
	// turn (no LLM response) and emit a structured event so an external
	// integration can pick it up. Out-of-scope for v1: full handoff workflow.
	if matchHandoffKeyword(msg.Content, beh.HandoffKeywords) {
		logger.InfoCF("agent", "Behavior filter: handoff keyword matched",
			map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "sender": msg.SenderID})
		al.emitHandoffEvent(ctx, msg)
		return false
	}

	return true
}

// matchHandoffKeyword reports whether `content` contains any of `keywords`
// (case-insensitive substring match). Empty keyword lists never match.
func matchHandoffKeyword(content string, keywords []string) bool {
	if len(keywords) == 0 || content == "" {
		return false
	}
	lowered := strings.ToLower(content)
	for _, kw := range keywords {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw != "" && strings.Contains(lowered, kw) {
			return true
		}
	}
	return false
}

// emitHandoffEvent publishes a runtime event signaling that a human handoff
// was requested. The event payload is intentionally minimal so downstream
// integrations (CRM, Slack notifiers, dashboard) can subscribe and react.
func (al *AgentLoop) emitHandoffEvent(ctx context.Context, msg bus.InboundMessage) {
	if al.runtimeEvents == nil {
		return
	}
	al.runtimeEvents.PublishNonBlocking(runtimeevents.Event{
		Kind:     KindBehaviorHandoffRequested,
		Source:   runtimeevents.Source{Component: "agent", Name: "behavior_filter"},
		Severity: runtimeevents.SeverityInfo,
		Scope: runtimeevents.Scope{
			Channel:   msg.Channel,
			ChatID:    msg.ChatID,
			SenderID:  msg.SenderID,
			MessageID: msg.MessageID,
		},
		Payload: map[string]any{
			"content": msg.Content,
		},
	})
	_ = ctx
}

// lastAssistantInHistory returns true iff the most recent non-system message in
// the history was authored by the assistant. Empty history returns false (user
// is initiating a fresh conversation — outbound-only mode rejects this).
func lastAssistantInHistory(history []providers.Message) bool {
	for i := len(history) - 1; i >= 0; i-- {
		role := history[i].Role
		if role == "system" {
			continue
		}
		return role == "assistant"
	}
	return false
}

// countUserMessages counts messages with role=user in the history. Used by
// max_messages_per_session.
func countUserMessages(history []providers.Message) int {
	n := 0
	for _, m := range history {
		if m.Role == "user" {
			n++
		}
	}
	return n
}

// publishOutOfHoursReply emits an outbound auto-response when an inbound
// message arrives outside business hours. Errors are logged but do not bubble
// up — the inbound message has already been dropped from the agent pipeline.
func (al *AgentLoop) publishOutOfHoursReply(ctx context.Context, msg bus.InboundMessage, reply string) {
	if reply == "" || al.bus == nil {
		return
	}
	pubCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out := bus.OutboundMessage{
		Channel: msg.Channel,
		ChatID:  msg.ChatID,
		Context: msg.Context,
		Content: reply,
	}
	if err := al.bus.PublishOutbound(pubCtx, out); err != nil {
		logger.WarnCF("agent", "Failed to publish out-of-hours reply",
			map[string]any{"channel": msg.Channel, "chat_id": msg.ChatID, "error": err.Error()})
	}
}
