package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const interactionAuditLogRelPath = "state/interaction-tools.log.jsonl"

var interactionAuditMu sync.Mutex

type interactionAuditEntry struct {
	Timestamp  string         `json:"ts"`
	Event      string         `json:"event"`
	TurnID     string         `json:"turn_id,omitempty"`
	SessionKey string         `json:"session_key,omitempty"`
	AgentID    string         `json:"agent_id,omitempty"`
	Channel    string         `json:"channel,omitempty"`
	ChatID     string         `json:"chat_id,omitempty"`
	Data       map[string]any `json:"data,omitempty"`
}

func writeInteractionAudit(ts *turnState, event string, data map[string]any) {
	if ts == nil || strings.TrimSpace(ts.workspace) == "" || strings.TrimSpace(event) == "" {
		return
	}

	entry := interactionAuditEntry{
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Event:      event,
		TurnID:     strings.TrimSpace(ts.turnID),
		SessionKey: strings.TrimSpace(ts.sessionKey),
		AgentID:    strings.TrimSpace(ts.agentID),
		Channel:    strings.TrimSpace(ts.channel),
		ChatID:     strings.TrimSpace(ts.chatID),
		Data:       data,
	}

	line, err := json.Marshal(entry)
	if err != nil {
		return
	}

	logPath := filepath.Join(ts.workspace, filepath.FromSlash(interactionAuditLogRelPath))
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return
	}

	interactionAuditMu.Lock()
	defer interactionAuditMu.Unlock()

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(line, '\n'))
}
