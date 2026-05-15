package agent

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/logger"
)

// Behavior holds the runtime behavioral toggles loaded from behavior.json in
// the agent workspace. It is the authoritative source for hard filters applied
// by the channel layer (pkg/channels) and the agent loop (pkg/agent).
//
// Fields mirror agentTemplateBehavior in web/backend/api so the JSON written by
// the template apply handler round-trips cleanly. Mirroring (instead of sharing
// a package) avoids importing web/backend from pkg/agent.
type Behavior struct {
	// Activation + where to respond
	MasterEnabled     bool   `json:"master_enabled"`
	BusinessHoursOnly bool   `json:"business_hours_only"`
	OutOfHoursReply   string `json:"out_of_hours_reply,omitempty"`
	RespondInDM       bool   `json:"respond_in_dm"`
	RespondInGroups   bool   `json:"respond_in_groups"`
	GroupMentionOnly  bool   `json:"group_mention_only"`
	KeywordTrigger    string `json:"keyword_trigger,omitempty"`

	// Outbound-only
	OutboundOnlyMode        bool `json:"outbound_only_mode"`
	IgnoreOtherBots         bool `json:"ignore_other_bots"`
	IgnoreForwardedMessages bool `json:"ignore_forwarded_messages"`
	IgnoreSelfMessages      bool `json:"ignore_self_messages"`

	// Media gating
	ProcessImages    bool `json:"process_images"`
	ProcessDocuments bool `json:"process_documents"`
	ProcessAudio     bool `json:"process_audio"`
	ProcessVideo     bool `json:"process_video"`
	ProcessStickers  bool `json:"process_stickers"`
	ProcessLocation  bool `json:"process_location"`
	MaxMediaSizeMB   int  `json:"max_media_size_mb,omitempty"`

	// Scope / privacy / throttle / handoff
	SessionTimeoutMinutes       int      `json:"session_timeout_minutes,omitempty"`
	MaxMessagesPerSession       int      `json:"max_messages_per_session,omitempty"`
	MaskPIIInReplies            bool     `json:"mask_pii_in_replies"`
	StoreReceivedMedia          bool     `json:"store_received_media"`
	MaxMessagesPerMinutePerUser int      `json:"max_messages_per_minute_per_user,omitempty"`
	ResponseCooldownSeconds     int      `json:"response_cooldown_seconds,omitempty"`
	HandoffKeywords             []string `json:"handoff_keywords,omitempty"`
	HandoffAfterFailures        int      `json:"handoff_after_failures,omitempty"`

	// Schedule snapshot denormalized from company_info at apply-time so the
	// agent loop does not need to re-read the template to evaluate business hours.
	Schedule BehaviorSchedule `json:"schedule"`
}

// BehaviorSchedule mirrors the weekly schedule used for the BusinessHoursOnly check.
type BehaviorSchedule struct {
	Monday    BehaviorDay `json:"monday"`
	Tuesday   BehaviorDay `json:"tuesday"`
	Wednesday BehaviorDay `json:"wednesday"`
	Thursday  BehaviorDay `json:"thursday"`
	Friday    BehaviorDay `json:"friday"`
	Saturday  BehaviorDay `json:"saturday"`
	Sunday    BehaviorDay `json:"sunday"`
	Notes     string      `json:"notes,omitempty"`
}

// BehaviorDay is a single day in BehaviorSchedule.
type BehaviorDay struct {
	Open bool   `json:"open"`
	From string `json:"from"`
	To   string `json:"to"`
}

// DefaultBehavior returns a Behavior with all toggles set to preserve the
// pre-feature runtime: everything enabled, no throttles, no filters. Workspaces
// without a behavior.json get this so existing agents behave identically.
func DefaultBehavior() *Behavior {
	return &Behavior{
		MasterEnabled:           true,
		BusinessHoursOnly:       false,
		RespondInDM:             true,
		RespondInGroups:         true,
		GroupMentionOnly:        false,
		OutboundOnlyMode:        false,
		IgnoreOtherBots:         false,
		IgnoreForwardedMessages: false,
		IgnoreSelfMessages:      true,
		ProcessImages:           true,
		ProcessDocuments:        true,
		ProcessAudio:            true,
		ProcessVideo:            true,
		ProcessStickers:         true,
		ProcessLocation:         true,
		StoreReceivedMedia:      true,
	}
}

// LoadBehavior reads behavior.json from the workspace. If the file is missing,
// DefaultBehavior() is returned with no error so pre-existing workspaces keep
// working. A parse error is logged and DefaultBehavior() is returned to avoid
// taking down the agent on a corrupted file.
func LoadBehavior(workspace string) *Behavior {
	if workspace == "" {
		return DefaultBehavior()
	}
	path := filepath.Join(workspace, "behavior.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			logger.WarnCF("agent", "Failed to read behavior.json", map[string]any{
				"path":  path,
				"error": err.Error(),
			})
		}
		return DefaultBehavior()
	}
	var b Behavior
	if err := json.Unmarshal(data, &b); err != nil {
		logger.WarnCF("agent", "Failed to parse behavior.json — falling back to defaults", map[string]any{
			"path":  path,
			"error": err.Error(),
		})
		return DefaultBehavior()
	}
	return &b
}

// WithinSchedule reports whether `now` falls inside the configured weekly
// schedule. Returns true when the schedule is empty (no constraints set),
// false when the day is not open or now is outside [from, to].
//
// The schedule's from/to are HH:MM strings interpreted in the system's local
// timezone. Malformed entries are treated as "closed for that day" so we err
// on the side of out-of-hours rather than accidentally answering.
func (b *Behavior) WithinSchedule(now time.Time) bool {
	if b == nil {
		return true
	}
	day := b.dayFor(now.Weekday())
	if !day.Open {
		return false
	}
	from, okFrom := parseClock(day.From)
	to, okTo := parseClock(day.To)
	if !okFrom || !okTo {
		return false
	}
	current := now.Hour()*60 + now.Minute()
	return current >= from && current <= to
}

func (b *Behavior) dayFor(wd time.Weekday) BehaviorDay {
	switch wd {
	case time.Monday:
		return b.Schedule.Monday
	case time.Tuesday:
		return b.Schedule.Tuesday
	case time.Wednesday:
		return b.Schedule.Wednesday
	case time.Thursday:
		return b.Schedule.Thursday
	case time.Friday:
		return b.Schedule.Friday
	case time.Saturday:
		return b.Schedule.Saturday
	case time.Sunday:
		return b.Schedule.Sunday
	}
	return BehaviorDay{}
}

// parseClock parses an "HH:MM" string into total minutes from midnight.
// Returns (0, false) on any parse failure.
func parseClock(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if len(s) < 4 {
		return 0, false
	}
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, false
	}
	h, bad := atoiClamped(parts[0], 0, 23)
	if bad {
		return 0, false
	}
	m, bad := atoiClamped(parts[1], 0, 59)
	if bad {
		return 0, false
	}
	return h*60 + m, true
}

// atoiClamped parses a numeric string and returns (value, true-if-bad). It is
// "bad" when the string contains a non-digit, exceeds hi, or is below lo.
func atoiClamped(s string, lo, hi int) (int, bool) {
	if s == "" {
		return 0, true
	}
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, true
		}
		n = n*10 + int(r-'0')
		if n > hi {
			return 0, true
		}
	}
	if n < lo {
		return 0, true
	}
	return n, false
}
