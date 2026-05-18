package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

func writeJSONOK(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// agentVersionsDir returns the directory where prompt-payload snapshots
// for a given agent are stored on disk. We deliberately use a hidden
// folder so it doesn't pollute the workspace tree the operator browses
// from a file explorer.
func agentVersionsDir(workspace string) string {
	return filepath.Join(workspace, ".versions")
}

// agentVersionMaxPerAgent caps the on-disk history. Matches the
// localStorage cap on the frontend.
const agentVersionMaxPerAgent = 20

// agentVersion is the persisted shape of a single prompt revision.
type agentVersion struct {
	ID        string          `json:"id"`
	AgentID   string          `json:"agent_id"`
	CreatedAt int64           `json:"created_at"`
	Label     string          `json:"label,omitempty"`
	Author    string          `json:"author,omitempty"`
	Payload   json.RawMessage `json:"payload"`
}

// agentVersionCreateRequest is what the frontend posts. Payload is
// passed through as raw JSON so we don't tie this endpoint to the
// (large) agentTemplateApplyRequest shape — versions are blobs.
type agentVersionCreateRequest struct {
	Label   string          `json:"label,omitempty"`
	Author  string          `json:"author,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

type agentVersionsListResponse struct {
	Versions []agentVersion `json:"versions"`
}

// registerAgentVersionRoutes wires the version history endpoints.
// Kept in a small dedicated function so it composes cleanly with the
// existing registerAgentTemplateRoutes group.
func (h *Handler) registerAgentVersionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/agents/{agentID}/versions", h.handleListAgentVersions)
	mux.HandleFunc("POST /api/agents/{agentID}/versions", h.handleCreateAgentVersion)
	mux.HandleFunc("DELETE /api/agents/{agentID}/versions/{versionID}", h.handleDeleteAgentVersion)
}

func (h *Handler) handleListAgentVersions(w http.ResponseWriter, r *http.Request) {
	workspace, agentID, ok := h.resolveVersionWorkspace(w, r)
	if !ok {
		return
	}
	versions, err := loadAgentVersions(workspace, agentID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list versions: %v", err))
		return
	}
	writeJSONOK(w, http.StatusOK, agentVersionsListResponse{Versions: versions})
}

func (h *Handler) handleCreateAgentVersion(w http.ResponseWriter, r *http.Request) {
	workspace, agentID, ok := h.resolveVersionWorkspace(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	limited := io.LimitReader(r.Body, 2*1024*1024)
	body, err := io.ReadAll(limited)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("failed to read body: %v", err))
		return
	}
	var req agentVersionCreateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}
	if len(req.Payload) == 0 {
		writeJSONError(w, http.StatusBadRequest, "payload is required")
		return
	}
	if !json.Valid(req.Payload) {
		writeJSONError(w, http.StatusBadRequest, "payload is not valid JSON")
		return
	}

	version := agentVersion{
		ID:        newVersionID(),
		AgentID:   agentID,
		CreatedAt: time.Now().UnixMilli(),
		Label:     strings.TrimSpace(req.Label),
		Author:    strings.TrimSpace(req.Author),
		Payload:   append(json.RawMessage(nil), req.Payload...),
	}
	if err := appendAgentVersion(workspace, version); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save version: %v", err))
		return
	}
	writeJSONOK(w, http.StatusCreated, version)
}

func (h *Handler) handleDeleteAgentVersion(w http.ResponseWriter, r *http.Request) {
	workspace, _, ok := h.resolveVersionWorkspace(w, r)
	if !ok {
		return
	}
	versionID := strings.TrimSpace(r.PathValue("versionID"))
	if !isSafeVersionID(versionID) {
		writeJSONError(w, http.StatusBadRequest, "invalid version id")
		return
	}
	target := filepath.Join(agentVersionsDir(workspace), versionID+".json")
	if err := os.Remove(target); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to delete version: %v", err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// resolveVersionWorkspace handles the agentID lookup + workspace
// resolution shared by every handler in this file.
func (h *Handler) resolveVersionWorkspace(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	rawID := strings.TrimSpace(r.PathValue("agentID"))
	agentID, err := normalizeDashboardAgentID(rawID)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return "", "", false
	}
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load config: %v", err))
		return "", "", false
	}
	if !agentConfigExists(cfg, agentID) {
		writeJSONError(w, http.StatusNotFound, "agent not found")
		return "", "", false
	}
	workspace := workspaceForAgentID(cfg, agentID)
	if workspace == "" {
		writeJSONError(w, http.StatusInternalServerError, "workspace path is not configured")
		return "", "", false
	}
	return workspace, agentID, true
}

// loadAgentVersions reads every <workspace>/.versions/*.json, filters
// for the supplied agentID, and returns them newest-first capped at
// agentVersionMaxPerAgent. Returns an empty slice when the directory
// doesn't exist yet (first-run is not an error).
func loadAgentVersions(workspace, agentID string) ([]agentVersion, error) {
	dir := agentVersionsDir(workspace)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []agentVersion{}, nil
		}
		return nil, err
	}
	versions := make([]agentVersion, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var v agentVersion
		if err := json.Unmarshal(data, &v); err != nil {
			continue
		}
		if v.AgentID != "" && v.AgentID != agentID {
			continue
		}
		versions = append(versions, v)
	}
	sort.SliceStable(versions, func(i, j int) bool {
		return versions[i].CreatedAt > versions[j].CreatedAt
	})
	if len(versions) > agentVersionMaxPerAgent {
		versions = versions[:agentVersionMaxPerAgent]
	}
	return versions, nil
}

// appendAgentVersion writes a new version to disk, then prunes the
// agent's history down to agentVersionMaxPerAgent (oldest dropped).
// Files are written via tmp+rename to keep readers consistent.
func appendAgentVersion(workspace string, v agentVersion) error {
	dir := agentVersionsDir(workspace)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if !isSafeVersionID(v.ID) {
		return fmt.Errorf("unsafe version id")
	}
	encoded, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	target := filepath.Join(dir, v.ID+".json")
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, encoded, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	pruneAgentVersions(workspace, v.AgentID)
	return nil
}

// listAgentVersionIDsForPrune returns all version IDs for the given agent
// from disk without applying the API cap, ordered newest-first.
func listAgentVersionIDsForPrune(workspace, agentID string) ([]string, error) {
	dir := agentVersionsDir(workspace)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	type versionFile struct {
		id      string
		modTime time.Time
	}

	files := make([]versionFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".json")
		if !isSafeVersionID(id) {
			continue
		}

		path := filepath.Join(dir, entry.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var v agentVersion
		if err := json.Unmarshal(raw, &v); err != nil {
			continue
		}
		if v.AgentID != agentID {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		files = append(files, versionFile{
			id:      id,
			modTime: info.ModTime(),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].modTime.Equal(files[j].modTime) {
			return files[i].id > files[j].id
		}
		return files[i].modTime.After(files[j].modTime)
	})

	ids := make([]string, 0, len(files))
	for _, file := range files {
		ids = append(ids, file.id)
	}
	return ids, nil
}

// pruneAgentVersions drops oldest files past the cap. Errors are
// swallowed because pruning is best-effort: the next write retries.
func pruneAgentVersions(workspace, agentID string) {
	versionIDs, err := listAgentVersionIDsForPrune(workspace, agentID)
	if err != nil || len(versionIDs) <= agentVersionMaxPerAgent {
		return
	}
	for _, dropID := range versionIDs[agentVersionMaxPerAgent:] {
		if !isSafeVersionID(dropID) {
			continue
		}
		_ = os.Remove(filepath.Join(agentVersionsDir(workspace), dropID+".json"))
	}
}

// isSafeVersionID guards against path traversal in DELETE handlers.
// Only the alphabet our generator emits is accepted.
func isSafeVersionID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		ok := (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '-' || r == '_'
		if !ok {
			return false
		}
	}
	return true
}

func newVersionID() string {
	var buf [9]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("v-%d", time.Now().UnixNano())
	}
	return "v-" + hex.EncodeToString(buf[:])
}
