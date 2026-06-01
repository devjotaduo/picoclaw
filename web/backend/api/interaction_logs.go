package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

const (
	interactionLogsRelPath      = "state/interaction-tools.log.jsonl"
	defaultInteractionLogsLimit = 200
	maxInteractionLogsLimit     = 2000
)

type interactionLogsResponse struct {
	Workspace string           `json:"workspace"`
	Path      string           `json:"path"`
	Exists    bool             `json:"exists"`
	Count     int              `json:"count"`
	Entries   []map[string]any `json:"entries"`
}

func (h *Handler) registerInteractionLogsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/interaction-logs", h.handleGetInteractionLogs)
}

func (h *Handler) handleGetInteractionLogs(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	limit, err := parseInteractionLogsLimit(r.URL.Query().Get("limit"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	workspace := cfg.WorkspacePath()
	logPath := filepath.Join(workspace, filepath.FromSlash(interactionLogsRelPath))
	entries, exists, err := readInteractionLogEntries(logPath, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read interaction logs: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, interactionLogsResponse{
		Workspace: "workspace",
		Path:      filepath.ToSlash(interactionLogsRelPath),
		Exists:    exists,
		Count:     len(entries),
		Entries:   entries,
	})
}

func parseInteractionLogsLimit(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultInteractionLogsLimit, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, errors.New("limit must be an integer")
	}
	if n <= 0 || n > maxInteractionLogsLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", maxInteractionLogsLimit)
	}
	return n, nil
}

func readInteractionLogEntries(path string, limit int) ([]map[string]any, bool, error) {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []map[string]any{}, false, nil
		}
		return nil, false, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	// Logs can include argument payloads; raise scan cap to 1 MiB per line.
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	ring := make([]map[string]any, 0, limit)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// Skip malformed line instead of failing whole endpoint.
			continue
		}
		if len(ring) < limit {
			ring = append(ring, entry)
			continue
		}
		copy(ring, ring[1:])
		ring[len(ring)-1] = entry
	}
	if err := scanner.Err(); err != nil {
		return nil, true, err
	}

	return ring, true, nil
}
