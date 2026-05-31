package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func stageProposal(t *testing.T, h *Handler, summary string, payload agentTemplateApplyRequest) *attendantProposal {
	t.Helper()
	body, err := json.Marshal(createAttendantProposalRequest{
		TargetID:   "main",
		ProposedBy: "assistente",
		Summary:    summary,
		Reason:     "owner asked for a friendlier tone",
		Payload:    &payload,
	})
	if err != nil {
		t.Fatalf("marshal proposal: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.handleAttendantProposals(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("stage status = %d, want 201, body=%s", rec.Code, rec.Body.String())
	}
	var p attendantProposal
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatalf("decode proposal: %v", err)
	}
	return &p
}

func validProposalPayload() agentTemplateApplyRequest {
	return agentTemplateApplyRequest{
		AgentID:      "main",
		TemplateID:   "atendente-geral",
		Name:         "Atendente Formal",
		Presentation: "Atendimento da empresa, tom formal.",
		Language:     "pt-br",
		Tone:         "formal",
	}
}

func TestAttendantProposal_StageDoesNotApply(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	p := stageProposal(t, h, "Mudar tom para formal", validProposalPayload())
	if p.Status != proposalPending {
		t.Fatalf("status = %q, want pending", p.Status)
	}
	// Staging must NOT write AGENT.md — nothing is applied until approval.
	if _, err := os.Stat(filepath.Join(workspace, "AGENT.md")); !os.IsNotExist(err) {
		t.Fatalf("AGENT.md should not exist after staging, stat err = %v", err)
	}
	// An approval notification should have been queued.
	items, _ := h.notifications.list(false, 0)
	found := false
	for _, n := range items {
		if n.Kind == NotificationKindApproval {
			found = true
		}
	}
	if !found {
		t.Error("expected an approval notification after staging")
	}
}

func TestAttendantProposal_ApproveApplies(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	p := stageProposal(t, h, "Mudar tom para formal", validProposalPayload())

	req := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals/"+p.ID+"/approve", nil)
	rec := httptest.NewRecorder()
	h.handleAttendantProposalByID(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	var resp attendantProposalDecisionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode decision: %v", err)
	}
	if !resp.Applied || resp.Proposal.Status != proposalApproved {
		t.Fatalf("expected applied+approved, got applied=%v status=%q", resp.Applied, resp.Proposal.Status)
	}
	// Approval must apply: AGENT.md now exists with the proposed name.
	agentMD, err := os.ReadFile(filepath.Join(workspace, "AGENT.md"))
	if err != nil {
		t.Fatalf("read AGENT.md after approval: %v", err)
	}
	if !strings.Contains(string(agentMD), "Atendente Formal") {
		t.Errorf("AGENT.md missing proposed name after approval")
	}
}

func TestAttendantProposal_RejectDoesNotApply(t *testing.T) {
	h, workspace := setupTemplateHandler(t)
	p := stageProposal(t, h, "Mudar tom para formal", validProposalPayload())

	req := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals/"+p.ID+"/reject", nil)
	rec := httptest.NewRecorder()
	h.handleAttendantProposalByID(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	var resp attendantProposalDecisionResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode decision: %v", err)
	}
	if resp.Applied || resp.Proposal.Status != proposalRejected {
		t.Fatalf("expected not-applied+rejected, got applied=%v status=%q", resp.Applied, resp.Proposal.Status)
	}
	if _, err := os.Stat(filepath.Join(workspace, "AGENT.md")); !os.IsNotExist(err) {
		t.Errorf("AGENT.md should not exist after rejection")
	}
}

func TestAttendantProposal_DoubleApproveConflicts(t *testing.T) {
	h, _ := setupTemplateHandler(t)
	p := stageProposal(t, h, "Mudar tom", validProposalPayload())

	for i, wantCode := range []int{http.StatusOK, http.StatusConflict} {
		req := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals/"+p.ID+"/approve", nil)
		rec := httptest.NewRecorder()
		h.handleAttendantProposalByID(rec, req)
		if rec.Code != wantCode {
			t.Fatalf("approve #%d status = %d, want %d, body=%s", i+1, rec.Code, wantCode, rec.Body.String())
		}
	}
}

func TestAttendantProposal_RejectsMissingPayload(t *testing.T) {
	h, _ := setupTemplateHandler(t)
	body, _ := json.Marshal(createAttendantProposalRequest{TargetID: "main", Summary: "x"})
	req := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.handleAttendantProposals(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for missing payload", rec.Code)
	}
}

func TestAttendantProposal_ListPendingOnly(t *testing.T) {
	h, _ := setupTemplateHandler(t)
	keep := stageProposal(t, h, "keep pending", validProposalPayload())
	reject := stageProposal(t, h, "to reject", validProposalPayload())

	rj := httptest.NewRequest(http.MethodPost, "/api/attendant-proposals/"+reject.ID+"/reject", nil)
	h.handleAttendantProposalByID(httptest.NewRecorder(), rj)

	req := httptest.NewRequest(http.MethodGet, "/api/attendant-proposals?pending=true", nil)
	rec := httptest.NewRecorder()
	h.handleAttendantProposals(rec, req)
	var resp struct {
		Proposals []*attendantProposal `json:"proposals"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(resp.Proposals) != 1 || resp.Proposals[0].ID != keep.ID {
		t.Fatalf("pending list = %d items, want only the kept proposal", len(resp.Proposals))
	}
}
