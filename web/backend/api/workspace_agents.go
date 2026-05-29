package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

type workspaceAgentItem struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	Visibility string `json:"visibility,omitempty"`
	Summary    string `json:"summary,omitempty"`
	Path       string `json:"path"`
	Content    string `json:"content,omitempty"`
}

type workspaceAgentsResponse struct {
	Workspace string               `json:"workspace"`
	Agents    []workspaceAgentItem `json:"agents"`
}

type workspaceAgentDetailResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	Visibility string `json:"visibility,omitempty"`
	Summary    string `json:"summary,omitempty"`
	Path       string `json:"path"`
	Content    string `json:"content"`
}

func (h *Handler) registerWorkspaceAgentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/agents", h.handleListWorkspaceAgents)
	mux.HandleFunc("GET /api/workspace/agents/{agentID}/raw", h.handleGetWorkspaceAgentRaw)
}

func (h *Handler) handleListWorkspaceAgents(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	workspace := cfg.WorkspacePath()
	agents, err := listWorkspaceAgents(workspace)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load workspace agents: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(workspaceAgentsResponse{
		Workspace: workspace,
		Agents:    agents,
	})
}

func (h *Handler) handleGetWorkspaceAgentRaw(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	agentID := strings.TrimSpace(r.PathValue("agentID"))
	if agentID == "" || strings.ContainsAny(agentID, `/\`) {
		http.Error(w, "invalid workspace agent id", http.StatusBadRequest)
		return
	}

	filename := agentID + ".md"
	fullPath := filepath.Join(cfg.WorkspacePath(), "agents", filename)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.Error(w, "workspace agent not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("Failed to load workspace agent: %v", err), http.StatusInternalServerError)
		return
	}

	agent := parseWorkspaceAgentFile(filename, string(content))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(workspaceAgentDetailResponseFromItem(agent, string(content)))
}

func listWorkspaceAgents(workspace string) ([]workspaceAgentItem, error) {
	agentsDir := filepath.Join(workspace, "agents")
	entries, err := os.ReadDir(agentsDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []workspaceAgentItem{}, nil
		}
		return nil, err
	}

	order := workspaceAgentOrder(workspace)
	agents := make([]workspaceAgentItem, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			fullPath := filepath.Join(agentsDir, entry.Name(), "AGENT.md")
			content, err := os.ReadFile(fullPath)
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					continue
				}
				return nil, err
			}
			agent := parseWorkspaceAgentFile(filepath.ToSlash(filepath.Join(entry.Name(), "AGENT.md")), string(content))
			if agent.Name == "" {
				continue
			}
			agent.ID = entry.Name()
			agent.Path = filepath.ToSlash(filepath.Join("agents", entry.Name(), "AGENT.md"))
			agent.Content = string(content)
			agents = append(agents, agent)
			continue
		}
		if !strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			continue
		}
		fullPath := filepath.Join(agentsDir, entry.Name())
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return nil, err
		}
		agent := parseWorkspaceAgentFile(entry.Name(), string(content))
		if agent.Name == "" {
			continue
		}
		agent.Content = string(content)
		agents = append(agents, agent)
	}

	sort.SliceStable(agents, func(i, j int) bool {
		left, leftOK := order[strings.ToLower(agents[i].Name)]
		right, rightOK := order[strings.ToLower(agents[j].Name)]
		if leftOK && rightOK {
			return left < right
		}
		if leftOK != rightOK {
			return leftOK
		}
		return strings.ToLower(agents[i].Name) < strings.ToLower(agents[j].Name)
	})
	return agents, nil
}

func parseWorkspaceAgentFile(filename string, content string) workspaceAgentItem {
	metadata, body := splitWorkspaceAgentFrontmatter(content)
	titleName, titleRole := workspaceAgentTitle(body)

	name := firstWorkspaceAgentNonEmpty(
		metadata["name"],
		titleName,
		strings.TrimSuffix(filename, filepath.Ext(filename)),
	)
	role := firstWorkspaceAgentNonEmpty(metadata["role"], titleRole, "Agente do workspace")

	return workspaceAgentItem{
		ID:         strings.TrimSuffix(filename, filepath.Ext(filename)),
		Name:       name,
		Role:       role,
		Visibility: metadata["visibility"],
		Summary:    workspaceAgentSummary(body),
		Path:       filepath.ToSlash(filepath.Join("agents", filename)),
	}
}

func workspaceAgentDetailResponseFromItem(agent workspaceAgentItem, content string) workspaceAgentDetailResponse {
	return workspaceAgentDetailResponse{
		ID:         agent.ID,
		Name:       agent.Name,
		Role:       agent.Role,
		Visibility: agent.Visibility,
		Summary:    agent.Summary,
		Path:       agent.Path,
		Content:    content,
	}
}

func splitWorkspaceAgentFrontmatter(content string) (map[string]string, string) {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return map[string]string{}, normalized
	}
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) != "---" {
			continue
		}
		return parseWorkspaceAgentFrontmatter(lines[1:i]), strings.Join(lines[i+1:], "\n")
	}
	return map[string]string{}, normalized
}

func parseWorkspaceAgentFrontmatter(lines []string) map[string]string {
	metadata := make(map[string]string, len(lines))
	for _, line := range lines {
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" && value != "" {
			metadata[key] = value
		}
	}
	return metadata
}

func workspaceAgentTitle(body string) (string, string) {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "# ") {
			continue
		}
		title := strings.TrimSpace(strings.TrimPrefix(line, "# "))
		if left, right, ok := strings.Cut(title, "\u2014"); ok {
			return strings.TrimSpace(left), strings.TrimSpace(right)
		}
		if left, right, ok := strings.Cut(title, "-"); ok {
			return strings.TrimSpace(left), strings.TrimSpace(right)
		}
		return title, ""
	}
	return "", ""
}

func workspaceAgentSummary(body string) string {
	for _, paragraph := range strings.Split(body, "\n\n") {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" || strings.HasPrefix(paragraph, "#") || strings.HasPrefix(paragraph, "-") {
			continue
		}
		return strings.Join(strings.Fields(paragraph), " ")
	}
	return ""
}

func workspaceAgentOrder(workspace string) map[string]int {
	content, err := os.ReadFile(filepath.Join(workspace, "AGENT.md"))
	if err != nil {
		return map[string]int{}
	}
	order := map[string]int{}
	inSection := false
	for _, rawLine := range strings.Split(string(content), "\n") {
		line := strings.TrimSpace(rawLine)
		if strings.HasPrefix(line, "## Agentes dispon") {
			inSection = true
			continue
		}
		if inSection && strings.HasPrefix(line, "## ") {
			break
		}
		if !inSection || !strings.HasPrefix(line, "- ") {
			continue
		}
		namePart := strings.TrimSpace(strings.TrimPrefix(line, "- "))
		if name, _, ok := strings.Cut(namePart, ":"); ok {
			order[strings.ToLower(strings.TrimSpace(name))] = len(order)
		}
	}
	return order
}

func firstWorkspaceAgentNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
