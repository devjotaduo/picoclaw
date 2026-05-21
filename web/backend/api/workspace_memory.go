package api

import (
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

type workspaceMemoryItem struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updated_at"`
	BackupCnt int    `json:"backup_count"`
}

type workspaceMemoryListResponse struct {
	Workspace string                `json:"workspace"`
	Files     []workspaceMemoryItem `json:"files"`
}

type workspaceMemoryDetailResponse struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Content   string `json:"content"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updated_at"`
}

type workspaceMemoryWriteRequest struct {
	Content string `json:"content"`
}

type workspaceMemoryWriteResponse struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	UpdatedAt  string `json:"updated_at"`
	BackupPath string `json:"backup_path,omitempty"`
}

// Limit a single memory file to 256 KiB — Markdown memory notes should never
// approach this size in practice; the cap protects the dashboard from
// accidentally pasting a binary blob.
const maxMemoryFileBytes = 256 * 1024

func (h *Handler) registerWorkspaceMemoryRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/memory", h.handleListWorkspaceMemory)
	mux.HandleFunc("GET /api/workspace/memory/{name}", h.handleGetWorkspaceMemory)
	mux.HandleFunc("PUT /api/workspace/memory/{name}", h.handlePutWorkspaceMemory)
}

func (h *Handler) handleListWorkspaceMemory(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	files, err := listWorkspaceMemoryFiles(workspace)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list memory files: %v", err), http.StatusInternalServerError)
		return
	}
	writeJSON(w, workspaceMemoryListResponse{Workspace: workspace, Files: files})
}

func (h *Handler) handleGetWorkspaceMemory(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	name, err := sanitizeMemoryName(r.PathValue("name"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fullPath := filepath.Join(cfg.WorkspacePath(), "memory", name)
	info, err := os.Stat(fullPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.Error(w, "memory file not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("Failed to stat memory file: %v", err), http.StatusInternalServerError)
		return
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read memory file: %v", err), http.StatusInternalServerError)
		return
	}
	writeJSON(w, workspaceMemoryDetailResponse{
		Name:      name,
		Path:      filepath.ToSlash(filepath.Join("memory", name)),
		Content:   string(content),
		Size:      info.Size(),
		UpdatedAt: info.ModTime().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) handlePutWorkspaceMemory(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	name, err := sanitizeMemoryName(r.PathValue("name"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxMemoryFileBytes+1))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read request body: %v", err), http.StatusBadRequest)
		return
	}
	if len(body) > maxMemoryFileBytes {
		http.Error(w, fmt.Sprintf("memory file exceeds %d bytes", maxMemoryFileBytes), http.StatusRequestEntityTooLarge)
		return
	}
	var req workspaceMemoryWriteRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	memoryDir := filepath.Join(cfg.WorkspacePath(), "memory")
	if err := os.MkdirAll(memoryDir, 0o755); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create memory dir: %v", err), http.StatusInternalServerError)
		return
	}
	fullPath := filepath.Join(memoryDir, name)

	var backupPath string
	if existing, err := os.ReadFile(fullPath); err == nil {
		stamp := time.Now().UTC().Format("20060102-150405")
		backupPath = fullPath + ".bak-" + stamp
		if writeErr := os.WriteFile(backupPath, existing, 0o644); writeErr != nil {
			http.Error(w, fmt.Sprintf("Failed to write backup: %v", writeErr), http.StatusInternalServerError)
			return
		}
	}

	if err := os.WriteFile(fullPath, []byte(req.Content), 0o644); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write memory file: %v", err), http.StatusInternalServerError)
		return
	}
	info, _ := os.Stat(fullPath)

	resp := workspaceMemoryWriteResponse{
		Name:      name,
		Size:      info.Size(),
		UpdatedAt: info.ModTime().UTC().Format(time.RFC3339),
	}
	if backupPath != "" {
		resp.BackupPath = filepath.ToSlash(backupPath)
	}
	writeJSON(w, resp)
}

func sanitizeMemoryName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("missing memory file name")
	}
	if strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return "", errors.New("invalid memory file name")
	}
	if !strings.EqualFold(filepath.Ext(name), ".md") {
		return "", errors.New("memory files must use the .md extension")
	}
	return name, nil
}

func listWorkspaceMemoryFiles(workspace string) ([]workspaceMemoryItem, error) {
	memoryDir := filepath.Join(workspace, "memory")
	entries, err := os.ReadDir(memoryDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []workspaceMemoryItem{}, nil
		}
		return nil, err
	}
	type counter struct {
		size      int64
		updatedAt string
		backups   int
	}
	stats := make(map[string]*counter)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		fname := entry.Name()
		if strings.HasSuffix(fname, ".md") {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			c := stats[fname]
			if c == nil {
				c = &counter{}
				stats[fname] = c
			}
			c.size = info.Size()
			c.updatedAt = info.ModTime().UTC().Format(time.RFC3339)
			continue
		}
		if idx := strings.Index(fname, ".md.bak-"); idx >= 0 {
			base := fname[:idx+3] // include ".md"
			c := stats[base]
			if c == nil {
				c = &counter{}
				stats[base] = c
			}
			c.backups++
		}
	}
	out := make([]workspaceMemoryItem, 0, len(stats))
	for name, c := range stats {
		if c.updatedAt == "" {
			continue
		}
		out = append(out, workspaceMemoryItem{
			Name:      name,
			Path:      filepath.ToSlash(filepath.Join("memory", name)),
			Size:      c.size,
			UpdatedAt: c.updatedAt,
			BackupCnt: c.backups,
		})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out, nil
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(payload)
}
