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

func setupVersionsHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	return setupTemplateHandler(t)
}

func postVersion(t *testing.T, h *Handler, agentID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	url := "/api/agents/" + agentID + "/versions"
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(encoded))
	req.SetPathValue("agentID", agentID)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.handleCreateAgentVersion(rec, req)
	return rec
}

func listVersions(t *testing.T, h *Handler, agentID string) *httptest.ResponseRecorder {
	t.Helper()
	url := "/api/agents/" + agentID + "/versions"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req.SetPathValue("agentID", agentID)
	rec := httptest.NewRecorder()
	h.handleListAgentVersions(rec, req)
	return rec
}

func deleteVersion(t *testing.T, h *Handler, agentID, versionID string) *httptest.ResponseRecorder {
	t.Helper()
	url := "/api/agents/" + agentID + "/versions/" + versionID
	req := httptest.NewRequest(http.MethodDelete, url, nil)
	req.SetPathValue("agentID", agentID)
	req.SetPathValue("versionID", versionID)
	rec := httptest.NewRecorder()
	h.handleDeleteAgentVersion(rec, req)
	return rec
}

func TestCreateVersion_PersistsAndReturnsID(t *testing.T) {
	h, _ := setupVersionsHandler(t)

	rec := postVersion(t, h, "main", agentVersionCreateRequest{
		Label:   "Aplicado em teste",
		Payload: json.RawMessage(`{"template_id":"atendente-geral","name":"Ana"}`),
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var v agentVersion
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if v.ID == "" || !strings.HasPrefix(v.ID, "v-") {
		t.Fatalf("expected generated id starting with v-, got %q", v.ID)
	}
	if v.AgentID != "main" {
		t.Fatalf("expected AgentID=main, got %q", v.AgentID)
	}
	if v.CreatedAt == 0 {
		t.Fatalf("CreatedAt was not set")
	}
}

func TestListVersions_EmptyWhenDirMissing(t *testing.T) {
	h, _ := setupVersionsHandler(t)

	rec := listVersions(t, h, "main")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp agentVersionsListResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Versions) != 0 {
		t.Fatalf("expected empty list, got %d entries", len(resp.Versions))
	}
}

func TestListVersions_NewestFirst(t *testing.T) {
	h, _ := setupVersionsHandler(t)

	_ = postVersion(t, h, "main", agentVersionCreateRequest{
		Label:   "primeiro",
		Payload: json.RawMessage(`{"name":"v1"}`),
	})
	_ = postVersion(t, h, "main", agentVersionCreateRequest{
		Label:   "segundo",
		Payload: json.RawMessage(`{"name":"v2"}`),
	})

	rec := listVersions(t, h, "main")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp agentVersionsListResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Versions) != 2 {
		t.Fatalf("expected 2 versions, got %d", len(resp.Versions))
	}
	if resp.Versions[0].Label != "segundo" {
		t.Fatalf("expected newest first; got %q at index 0", resp.Versions[0].Label)
	}
}

func TestListVersions_CapsAt20(t *testing.T) {
	h, _ := setupVersionsHandler(t)

	for i := 0; i < 25; i++ {
		rec := postVersion(t, h, "main", agentVersionCreateRequest{
			Label:   "bulk",
			Payload: json.RawMessage(`{"name":"x"}`),
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create #%d returned %d: %s", i, rec.Code, rec.Body.String())
		}
	}

	rec := listVersions(t, h, "main")
	var resp agentVersionsListResponse
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if len(resp.Versions) > agentVersionMaxPerAgent {
		t.Fatalf("expected at most %d versions, got %d", agentVersionMaxPerAgent, len(resp.Versions))
	}
}

func TestDeleteVersion_RemovesFile(t *testing.T) {
	h, workspace := setupVersionsHandler(t)

	postRec := postVersion(t, h, "main", agentVersionCreateRequest{
		Label:   "to delete",
		Payload: json.RawMessage(`{"name":"x"}`),
	})
	var created agentVersion
	_ = json.NewDecoder(postRec.Body).Decode(&created)

	rec := deleteVersion(t, h, "main", created.ID)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}

	if _, err := os.Stat(filepath.Join(workspace, ".versions", created.ID+".json")); !os.IsNotExist(err) {
		t.Fatalf("expected version file to be removed; stat err = %v", err)
	}
}

func TestDeleteVersion_PathTraversalRejected(t *testing.T) {
	h, _ := setupVersionsHandler(t)

	rec := deleteVersion(t, h, "main", "../../etc/passwd")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsafe id, got %d", rec.Code)
	}
}

func TestCreateVersion_RejectsInvalidJSONPayload(t *testing.T) {
	h, _ := setupVersionsHandler(t)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/agents/main/versions",
		bytes.NewReader([]byte(`{"label":"x","payload":{"name":"ok"}} trailing`)),
	)
	req.SetPathValue("agentID", "main")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.handleCreateAgentVersion(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateVersion_UnknownAgentReturns404(t *testing.T) {
	h, _ := setupVersionsHandler(t)
	rec := postVersion(t, h, "ghost-agent", agentVersionCreateRequest{
		Payload: json.RawMessage(`{"name":"x"}`),
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestIsSafeVersionID(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"v-abc123", true},
		{"v-ABCxyz", true},
		{"valid_under_score", true},
		{"", false},
		{"with space", false},
		{"path/traversal", false},
		{"with.dot", false},
		{strings.Repeat("a", 65), false},
	}
	for _, c := range cases {
		if got := isSafeVersionID(c.in); got != c.want {
			t.Errorf("isSafeVersionID(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
