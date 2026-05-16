package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sipeed/picoclaw/pkg/agent"
	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/routing"
)

type internalAgentTurnRequest struct {
	AgentID     string `json:"agent_id"`
	SessionID   string `json:"session_id,omitempty"`
	Content     string `json:"content"`
	ActorRole   string `json:"actor_role,omitempty"`
	ActorUserID string `json:"actor_user_id,omitempty"`
}

type internalAgentTurnResponse struct {
	AgentID   string `json:"agent_id"`
	SessionID string `json:"session_id"`
	Content   string `json:"content"`
}

func registerInternalAgentTurnRoute(cm *channels.Manager, al *agent.AgentLoop, authToken string) {
	if cm == nil || al == nil {
		return
	}
	cm.HandleHTTPFunc("/internal/agent-turn", func(w http.ResponseWriter, r *http.Request) {
		handleInternalAgentTurn(w, r, al, authToken)
	})
}

func handleInternalAgentTurn(w http.ResponseWriter, r *http.Request, al *agent.AgentLoop, authToken string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeInternalAgentError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !validInternalAgentToken(r, authToken) {
		writeInternalAgentError(w, http.StatusUnauthorized, "missing or invalid internal token")
		return
	}

	var body internalAgentTurnRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeInternalAgentError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	agentID := routing.NormalizeAgentID(body.AgentID)
	content := strings.TrimSpace(body.Content)
	if agentID == "" || content == "" {
		writeInternalAgentError(w, http.StatusBadRequest, "agent_id and content are required")
		return
	}
	if _, ok := al.GetRegistry().GetAgent(agentID); !ok {
		writeInternalAgentError(w, http.StatusNotFound, "agent not found")
		return
	}

	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		sessionID = uuid.NewString()
	}
	actorID := strings.TrimSpace(body.ActorUserID)
	if actorID == "" {
		actorID = "panel"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	response, err := al.ProcessDirectWithContext(ctx, content, "", bus.InboundContext{
		Channel:   "panel",
		ChatID:    "panel:" + sessionID,
		ChatType:  "direct",
		SpaceID:   agentID,
		SpaceType: "agent",
		SenderID:  "panel:" + actorID,
		Raw: map[string]string{
			"actor_role":    strings.TrimSpace(body.ActorRole),
			"actor_user_id": actorID,
			"agent_id":      agentID,
		},
	})
	if err != nil {
		writeInternalAgentError(w, http.StatusBadGateway, err.Error())
		return
	}

	_ = json.NewEncoder(w).Encode(internalAgentTurnResponse{
		AgentID:   agentID,
		SessionID: sessionID,
		Content:   response,
	})
}

func validInternalAgentToken(r *http.Request, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return false
	}
	token := strings.TrimSpace(r.Header.Get("X-Picoclaw-Token"))
	if token == "" {
		auth := strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = strings.TrimSpace(auth[len("bearer "):])
		}
	}
	if token == "" || len(token) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}

func writeInternalAgentError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
