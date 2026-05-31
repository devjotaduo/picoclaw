package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// attendant_proposals implements the v2.0 "approval-always" config flow: the
// assistant agent stages a proposed change to the attendant agent (it never
// applies directly), which fires an approval notification; the tenant owner
// then approves or rejects from the dashboard. Approval runs the same
// applyAgentDefinition service the dashboard editor uses, so there is exactly
// one apply path.
//
// The store is in-memory like notificationStore — proposals are transient
// (decided or dropped on restart). That's acceptable: a lost pending proposal
// just means the assistant re-proposes; nothing was applied.

type proposalStatus string

const (
	proposalPending  proposalStatus = "pending"
	proposalApproved proposalStatus = "approved"
	proposalRejected proposalStatus = "rejected"
)

const (
	proposalReasonMaxLen  = 600
	proposalSummaryMaxLen = 280
	attendantProposalCap  = 200 // ring buffer; oldest decided/pending dropped on overflow
)

// attendantProposal is a staged, not-yet-applied change to an agent's
// definition. Payload is the full agentTemplateApplyRequest the assistant wants
// applied — identical shape to the dashboard editor's apply body — so approval
// can replay it verbatim through applyAgentDefinition.
type attendantProposal struct {
	ID         string                     `json:"id"`
	TargetID   string                     `json:"target_id"`             // agent being reconfigured (normalized)
	ProposedBy string                     `json:"proposed_by,omitempty"` // agent id that staged it (e.g. assistente)
	Summary    string                     `json:"summary"`               // one-line human description for the card
	Reason     string                     `json:"reason,omitempty"`      // why the change (assistant's rationale)
	Status     proposalStatus             `json:"status"`
	Payload    *agentTemplateApplyRequest `json:"payload"`
	CreatedAt  time.Time                  `json:"created_at"`
	DecidedAt  *time.Time                 `json:"decided_at,omitempty"`
}

type attendantProposalStore struct {
	mu    sync.RWMutex
	items []*attendantProposal // newest first
	cap   int
}

func newAttendantProposalStore() *attendantProposalStore {
	return &attendantProposalStore{cap: attendantProposalCap}
}

func (s *attendantProposalStore) add(p *attendantProposal) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items = append([]*attendantProposal{p}, s.items...)
	if len(s.items) > s.cap {
		s.items = s.items[:s.cap]
	}
}

func (s *attendantProposalStore) get(id string) *attendantProposal {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.items {
		if p.ID == id {
			return p
		}
	}
	return nil
}

// list returns proposals newest-first. When pendingOnly is true, only
// undecided proposals are returned (what the dashboard card stack shows).
func (s *attendantProposalStore) list(pendingOnly bool) []*attendantProposal {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*attendantProposal, 0, len(s.items))
	for _, p := range s.items {
		if pendingOnly && p.Status != proposalPending {
			continue
		}
		out = append(out, p)
	}
	return out
}

// decide transitions a pending proposal to approved/rejected exactly once.
// Returns the proposal and whether the transition happened (false if not found
// or already decided), so the caller can apply on a real approval transition
// and stay idempotent against double-clicks.
func (s *attendantProposalStore) decide(id string, status proposalStatus) (*attendantProposal, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.items {
		if p.ID != id {
			continue
		}
		if p.Status != proposalPending {
			return p, false
		}
		now := time.Now().UTC()
		p.Status = status
		p.DecidedAt = &now
		return p, true
	}
	return nil, false
}

func (h *Handler) ensureAttendantProposalStore() {
	if h.attendantProposals == nil {
		h.attendantProposals = newAttendantProposalStore()
	}
	if h.notifications == nil {
		h.notifications = newNotificationStore()
	}
}

// registerAttendantProposalRoutes wires the proposal endpoints:
//
//	POST   /api/attendant-proposals               assistant stages a proposal (internal token)
//	GET    /api/attendant-proposals?pending=true  dashboard lists proposals
//	POST   /api/attendant-proposals/{id}/approve  owner approves -> applies
//	POST   /api/attendant-proposals/{id}/reject   owner rejects
func (h *Handler) registerAttendantProposalRoutes(mux *http.ServeMux) {
	h.ensureAttendantProposalStore()
	mux.HandleFunc("/api/attendant-proposals", h.handleAttendantProposals)
	mux.HandleFunc("/api/attendant-proposals/", h.handleAttendantProposalByID)
}

func (h *Handler) handleAttendantProposals(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleListAttendantProposals(w, r)
	case http.MethodPost:
		h.handleCreateAttendantProposal(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleListAttendantProposals(w http.ResponseWriter, r *http.Request) {
	h.ensureAttendantProposalStore()
	pendingOnly := r.URL.Query().Get("pending") == "true"
	items := h.attendantProposals.list(pendingOnly)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Proposals []*attendantProposal `json:"proposals"`
	}{Proposals: items})
}

type createAttendantProposalRequest struct {
	TargetID   string                     `json:"target_id"`
	ProposedBy string                     `json:"proposed_by,omitempty"`
	Summary    string                     `json:"summary"`
	Reason     string                     `json:"reason,omitempty"`
	Payload    *agentTemplateApplyRequest `json:"payload"`
}

// handleCreateAttendantProposal stages a proposal. The assistant agent calls
// this via the launcher internal token (same auth as notify_user). It does NOT
// apply anything — it validates the payload shape, stores the proposal, and
// fires an approval notification so the owner sees a pending card.
func (h *Handler) handleCreateAttendantProposal(w http.ResponseWriter, r *http.Request) {
	h.ensureAttendantProposalStore()
	var req createAttendantProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Payload == nil {
		http.Error(w, "payload is required", http.StatusBadRequest)
		return
	}
	targetID, err := normalizeDashboardAgentID(req.TargetID)
	if err != nil {
		http.Error(w, "invalid target_id", http.StatusBadRequest)
		return
	}
	// The payload's agent_id must match the proposal target so approval can't
	// be redirected to a different agent than the card shows.
	req.Payload.AgentID = targetID
	if normErr := normalizeProposalPayload(req.Payload); normErr != nil {
		http.Error(w, normErr.Error(), http.StatusBadRequest)
		return
	}

	summary := strings.TrimSpace(req.Summary)
	if summary == "" {
		summary = "Atualização de configuração do atendente"
	}
	if len(summary) > proposalSummaryMaxLen {
		summary = summary[:proposalSummaryMaxLen]
	}
	reason := strings.TrimSpace(req.Reason)
	if len(reason) > proposalReasonMaxLen {
		reason = reason[:proposalReasonMaxLen]
	}

	p := &attendantProposal{
		ID:         uuid.NewString(),
		TargetID:   targetID,
		ProposedBy: strings.TrimSpace(req.ProposedBy),
		Summary:    summary,
		Reason:     reason,
		Status:     proposalPending,
		Payload:    req.Payload,
		CreatedAt:  time.Now().UTC(),
	}
	h.attendantProposals.add(p)

	// Surface an approval notification so the owner sees it in the panel even
	// if they're not on the agent editor page. Best-effort: a notification
	// failure must not fail the staging call.
	h.notifications.add(&Notification{
		ID:        uuid.NewString(),
		Kind:      NotificationKindApproval,
		Title:     "Mudança proposta no atendente",
		Body:      summary,
		AgentID:   p.ProposedBy,
		CTAURL:    "/agent/proposals",
		CTALabel:  "Revisar",
		CreatedAt: time.Now().UTC(),
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(p)
}

func (h *Handler) handleAttendantProposalByID(w http.ResponseWriter, r *http.Request) {
	h.ensureAttendantProposalStore()
	rest := strings.TrimPrefix(r.URL.Path, "/api/attendant-proposals/")
	switch {
	case strings.HasSuffix(rest, "/approve"):
		h.decideAttendantProposal(w, r, strings.TrimSuffix(rest, "/approve"), proposalApproved)
	case strings.HasSuffix(rest, "/reject"):
		h.decideAttendantProposal(w, r, strings.TrimSuffix(rest, "/reject"), proposalRejected)
	default:
		id := strings.TrimSuffix(rest, "/")
		if id == "" || strings.Contains(id, "/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p := h.attendantProposals.get(id)
		if p == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(p)
	}
}

type attendantProposalDecisionResponse struct {
	Proposal *attendantProposal `json:"proposal"`
	Applied  bool               `json:"applied"`
	Reload   string             `json:"reload,omitempty"`
	Warning  string             `json:"warning,omitempty"`
}

// decideAttendantProposal approves or rejects a pending proposal. This endpoint
// is the OWNER action (dashboard-gated by the normal session cookie), which is
// exactly where authorization lives in the approval-always model: the assistant
// can only stage, never apply. On approval it replays the proposal payload
// through applyAgentDefinition — the single shared apply path.
func (h *Handler) decideAttendantProposal(w http.ResponseWriter, r *http.Request, id string, status proposalStatus) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id = strings.TrimSuffix(strings.TrimSpace(id), "/")
	if id == "" {
		http.NotFound(w, r)
		return
	}

	// Peek first so a not-found vs already-decided is distinguishable, but the
	// authoritative transition happens atomically in decide() below.
	if existing := h.attendantProposals.get(id); existing == nil {
		http.NotFound(w, r)
		return
	}

	if status == proposalRejected {
		p, ok := h.attendantProposals.decide(id, proposalRejected)
		if !ok {
			http.Error(w, "proposal already decided", http.StatusConflict)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(attendantProposalDecisionResponse{Proposal: p, Applied: false})
		return
	}

	// Approval: transition first (idempotent guard against double-clicks), then
	// apply. If apply fails we surface the error but keep the proposal marked
	// approved — re-approving a decided proposal is a no-op, so the owner can't
	// accidentally apply twice; they'd re-stage via the assistant if needed.
	p, ok := h.attendantProposals.decide(id, proposalApproved)
	if !ok {
		http.Error(w, "proposal already decided", http.StatusConflict)
		return
	}
	res, statusCode, err := h.applyAgentDefinition(p.Payload)
	if err != nil {
		writeJSONError(w, statusCode, fmt.Sprintf("approved but apply failed: %v", err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(attendantProposalDecisionResponse{
		Proposal: p,
		Applied:  true,
		Reload:   res.Reload,
		Warning:  res.Warning,
	})
}

// normalizeProposalPayload runs the same head-of-handler normalization the HTTP
// editor applies before applyAgentDefinition, so a staged proposal that gets
// approved later won't be rejected for a name/template the editor would have
// caught at submit time.
func normalizeProposalPayload(req *agentTemplateApplyRequest) error {
	return validateAgentTemplateRequest(req)
}
