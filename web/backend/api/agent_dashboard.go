package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
)

const (
	agentDashboardSourceWorkspaceAgents = "workspace/agents"
	agentDashboardSourceDashboardItems  = "workspace/dashboard/items"
	agentDashboardSourceMemory          = "workspace/memory"
	agentDashboardSourceCron            = "workspace/cron/jobs.json"
	agentDashboardSourceOutputReports   = "workspace/output/reports"
	agentDashboardSourceOutputPlans     = "workspace/output/plans"
	agentDashboardSourceOutputData      = "workspace/output/data"
	agentDashboardSourceOutputAnalytics = "workspace/output/analytics"
	agentDashboardSourceTestReports     = "workspace/tests/relatorios"
)

type agentDashboardResponse struct {
	Workspace   string                   `json:"workspace"`
	GeneratedAt string                   `json:"generated_at"`
	Metrics     agentDashboardMetrics    `json:"metrics"`
	Agents      []agentDashboardAgent    `json:"agents"`
	Items       []agentDashboardItem     `json:"items"`
	Tasks       []agentDashboardTask     `json:"tasks"`
	Artifacts   []agentDashboardArtifact `json:"artifacts"`
	Health      agentDashboardHealth     `json:"health"`
}

type agentDashboardMetrics struct {
	Agents       int `json:"agents"`
	ActiveAgents int `json:"active_agents"`
	PendingItems int `json:"pending_items"`
	Reports      int `json:"reports"`
	ActiveTasks  int `json:"active_tasks"`
	Alerts       int `json:"alerts"`
}

type agentDashboardAgent struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	Active     bool   `json:"active"`
	ItemCount  int    `json:"item_count"`
	TaskCount  int    `json:"task_count"`
	LastItemAt string `json:"last_item_at,omitempty"`
}

type agentDashboardItem struct {
	ID        string                   `json:"id"`
	Type      string                   `json:"type"`
	Status    string                   `json:"status"`
	Title     string                   `json:"title"`
	Summary   string                   `json:"summary,omitempty"`
	AgentID   string                   `json:"agent_id,omitempty"`
	AgentName string                   `json:"agent_name,omitempty"`
	Priority  string                   `json:"priority,omitempty"`
	Source    string                   `json:"source"`
	CreatedAt string                   `json:"created_at,omitempty"`
	UpdatedAt string                   `json:"updated_at,omitempty"`
	DueAt     string                   `json:"due_at,omitempty"`
	Tags      []string                 `json:"tags,omitempty"`
	Metrics   map[string]string        `json:"metrics,omitempty"`
	Artifacts []agentDashboardArtifact `json:"artifacts,omitempty"`
}

type agentDashboardTask struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	AgentID   string `json:"agent_id,omitempty"`
	AgentName string `json:"agent_name,omitempty"`
	Source    string `json:"source"`
	Schedule  string `json:"schedule,omitempty"`
	NextRunAt string `json:"next_run_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type agentDashboardHealth struct {
	MissingSources []string `json:"missing_sources"`
	Errors         []string `json:"errors"`
	UpdatedAt      string   `json:"updated_at"`
}

type agentDashboardArtifact struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Source    string `json:"source"`
	URL       string `json:"url"`
	AgentID   string `json:"agent_id,omitempty"`
	AgentName string `json:"agent_name,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

type agentDashboardFileItem struct {
	ID        string                   `json:"id"`
	Type      string                   `json:"type"`
	Status    string                   `json:"status"`
	Title     string                   `json:"title"`
	Summary   string                   `json:"summary"`
	AgentID   string                   `json:"agent_id"`
	AgentName string                   `json:"agent_name"`
	Priority  string                   `json:"priority"`
	CreatedAt string                   `json:"created_at"`
	UpdatedAt string                   `json:"updated_at"`
	DueAt     string                   `json:"due_at"`
	Tags      []string                 `json:"tags"`
	Metrics   map[string]string        `json:"metrics"`
	Artifacts []agentDashboardArtifact `json:"artifacts"`
}

type agentDashboardResponseCreateRequest struct {
	ItemID     string `json:"item_id"`
	ItemSource string `json:"item_source"`
	AgentID    string `json:"agent_id"`
	AgentName  string `json:"agent_name"`
	Message    string `json:"message"`
}

type agentDashboardSavedResponse struct {
	ID         string `json:"id"`
	ItemID     string `json:"item_id,omitempty"`
	ItemSource string `json:"item_source,omitempty"`
	AgentID    string `json:"agent_id,omitempty"`
	AgentName  string `json:"agent_name,omitempty"`
	Message    string `json:"message"`
	CreatedAt  string `json:"created_at"`
}

type agentDashboardCronStore struct {
	Jobs []json.RawMessage `json:"jobs"`
}

type agentDashboardCronJob struct {
	ID             string                     `json:"id"`
	Name           string                     `json:"name"`
	Enabled        bool                       `json:"enabled"`
	Schedule       agentDashboardCronSchedule `json:"schedule"`
	Payload        agentDashboardCronPayload  `json:"payload"`
	State          map[string]json.RawMessage `json:"state"`
	CreatedAtMs    int64                      `json:"createdAtMs"`
	UpdatedAtMs    int64                      `json:"updatedAtMs"`
	DeleteAfterRun bool                       `json:"deleteAfterRun"`
}

type agentDashboardCronSchedule struct {
	Kind    string `json:"kind"`
	Expr    string `json:"expr"`
	TZ      string `json:"tz"`
	EveryMS *int64 `json:"every_ms"`
}

type agentDashboardCronPayload struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Command string `json:"command"`
	Channel string `json:"channel"`
	To      string `json:"to"`
	AgentID string `json:"agent_id"`
}

func (h *Handler) registerAgentDashboardRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/agent-dashboard", h.handleGetAgentDashboard)
	mux.HandleFunc("POST /api/agent-dashboard/responses", h.handleCreateAgentDashboardResponse)
	mux.HandleFunc("GET /api/agent-dashboard/artifacts/{asset...}", h.handleGetAgentDashboardArtifact)
	mux.HandleFunc("HEAD /api/agent-dashboard/artifacts/{asset...}", h.handleGetAgentDashboardArtifact)
}

func (h *Handler) handleGetAgentDashboard(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load config: %v", err))
		return
	}
	response := buildAgentDashboardResponse(cfg, time.Now().UTC())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(response)
}

func (h *Handler) handleCreateAgentDashboardResponse(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load config: %v", err))
		return
	}
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 128*1024))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("failed to read body: %v", err))
		return
	}
	var req agentDashboardResponseCreateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}
	message := strings.TrimSpace(req.Message)
	if message == "" {
		writeJSONError(w, http.StatusBadRequest, "message is required")
		return
	}
	if len(message) > 4000 {
		writeJSONError(w, http.StatusBadRequest, "message is too long")
		return
	}
	saved := agentDashboardSavedResponse{
		ID:         newAgentDashboardResponseID(req.ItemID),
		ItemID:     truncateDashboardText(strings.TrimSpace(req.ItemID), 180),
		ItemSource: truncateDashboardText(strings.TrimSpace(req.ItemSource), 240),
		AgentID:    truncateDashboardText(strings.TrimSpace(req.AgentID), 120),
		AgentName:  truncateDashboardText(strings.TrimSpace(req.AgentName), 160),
		Message:    message,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	if err := saveAgentDashboardResponse(cfg.WorkspacePath(), saved); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save response: %v", err))
		return
	}
	writeJSONOK(w, http.StatusCreated, saved)
}

func (h *Handler) handleGetAgentDashboardArtifact(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	file, ok := resolveAgentDashboardArtifactPath(cfg.WorkspacePath(), r.PathValue("asset"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	info, err := os.Stat(file)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	if ct := mime.TypeByExtension(filepath.Ext(file)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	http.ServeFile(w, r, file)
}

func buildAgentDashboardResponse(cfg *config.Config, now time.Time) agentDashboardResponse {
	workspace := cfg.WorkspacePath()
	health := agentDashboardHealth{
		MissingSources: []string{},
		Errors:         []string{},
		UpdatedAt:      now.Format(time.RFC3339),
	}
	agentMap := map[string]*agentDashboardAgent{}

	for _, agent := range loadDashboardWorkspaceAgents(workspace, &health) {
		addAgentDashboardAgent(agentMap, agent.ID, agent.Name, agent.Role, true)
	}
	for _, agent := range cfg.Agents.List {
		id := orchestrator.CanonicalAgentID(agent.ID)
		if id == "" {
			continue
		}
		addAgentDashboardAgent(agentMap, id, firstNonEmpty(agent.Name, agent.ID), "Agente interno", agent.IsEnabled())
	}

	publishedItems := loadDashboardPublishedItems(workspace, &health)
	memoryItems := loadDashboardMemoryItems(workspace, &health, agentMap)
	generatedItems := loadDashboardGeneratedItems(workspace, &health, agentMap)
	proposalItems := loadDashboardAgentProposals(cfg, &health)
	items := make(
		[]agentDashboardItem,
		0,
		len(publishedItems)+len(memoryItems)+len(generatedItems)+len(proposalItems),
	)
	items = append(items, publishedItems...)
	items = append(items, memoryItems...)
	items = append(items, generatedItems...)
	items = append(items, proposalItems...)
	normalizeDashboardItems(items)
	reconcileDashboardItemAgents(items, agentMap)
	artifacts := loadDashboardOutputArtifacts(workspace, &health, agentMap)
	for _, item := range items {
		artifacts = append(artifacts, item.Artifacts...)
	}
	artifacts = normalizeDashboardArtifacts(artifacts)
	reconcileDashboardArtifactAgents(artifacts, agentMap)

	tasks := loadDashboardCronTasks(workspace, &health)
	for _, item := range items {
		if item.Type != "task" {
			continue
		}
		tasks = append(tasks, agentDashboardTask{
			ID:        item.ID,
			Title:     item.Title,
			Status:    item.Status,
			AgentID:   item.AgentID,
			AgentName: item.AgentName,
			Source:    item.Source,
			NextRunAt: item.DueAt,
			UpdatedAt: firstNonEmpty(item.UpdatedAt, item.CreatedAt),
		})
	}
	reconcileDashboardTaskAgents(tasks, agentMap)

	sort.SliceStable(items, func(i, j int) bool {
		return dashboardSortStamp(items[i]) > dashboardSortStamp(items[j])
	})
	sort.SliceStable(tasks, func(i, j int) bool {
		return firstNonEmpty(tasks[i].NextRunAt, tasks[i].UpdatedAt, tasks[i].ID) >
			firstNonEmpty(tasks[j].NextRunAt, tasks[j].UpdatedAt, tasks[j].ID)
	})

	metrics := agentDashboardMetrics{}
	metrics.Reports = 0
	for _, item := range items {
		if item.Type == "report" {
			metrics.Reports++
		}
		if isDashboardPendingStatus(item.Status) {
			metrics.PendingItems++
		}
		if dashboardPriorityRank(item.Priority) >= 3 || item.Status == "new" {
			metrics.Alerts++
		}
		if agent := findDashboardAgent(agentMap, item.AgentID, item.AgentName); agent != nil {
			agent.ItemCount++
			if dashboardSortStamp(item) > agent.LastItemAt {
				agent.LastItemAt = dashboardSortStamp(item)
			}
		}
	}
	for _, task := range tasks {
		if task.Status == "scheduled" || task.Status == "pending" || task.Status == "in_progress" {
			metrics.ActiveTasks++
		}
		if agent := findDashboardAgent(agentMap, task.AgentID, task.AgentName); agent != nil {
			agent.TaskCount++
		}
	}

	agents := make([]agentDashboardAgent, 0, len(agentMap))
	for _, agent := range agentMap {
		metrics.Agents++
		if agent.Active {
			metrics.ActiveAgents++
		}
		agents = append(agents, *agent)
	}
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].Active != agents[j].Active {
			return agents[i].Active
		}
		return strings.ToLower(agents[i].Name) < strings.ToLower(agents[j].Name)
	})

	return agentDashboardResponse{
		Workspace:   "workspace",
		GeneratedAt: now.Format(time.RFC3339),
		Metrics:     metrics,
		Agents:      agents,
		Items:       items,
		Tasks:       tasks,
		Artifacts:   artifacts,
		Health:      health,
	}
}

func loadDashboardWorkspaceAgents(workspace string, health *agentDashboardHealth) []workspaceAgentItem {
	agents, err := listWorkspaceAgents(workspace)
	if err != nil {
		health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", agentDashboardSourceWorkspaceAgents, err))
		return nil
	}
	return agents
}

func loadDashboardPublishedItems(workspace string, health *agentDashboardHealth) []agentDashboardItem {
	dir := filepath.Join(workspace, "dashboard", "items")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			health.MissingSources = append(health.MissingSources, agentDashboardSourceDashboardItems)
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", agentDashboardSourceDashboardItems, err))
		return nil
	}
	items := make([]agentDashboardItem, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".json") {
			continue
		}
		source := filepath.ToSlash(filepath.Join(agentDashboardSourceDashboardItems, entry.Name()))
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", source, err))
			continue
		}
		var fileItem agentDashboardFileItem
		if err := json.Unmarshal(data, &fileItem); err != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("%s: invalid JSON", source))
			continue
		}
		id := strings.TrimSpace(fileItem.ID)
		if id == "" {
			id = strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		}
		title := strings.TrimSpace(fileItem.Title)
		if title == "" {
			health.Errors = append(health.Errors, fmt.Sprintf("%s: title is required", source))
			continue
		}
		items = append(items, agentDashboardItem{
			ID:        id,
			Type:      normalizeDashboardType(fileItem.Type),
			Status:    normalizeDashboardStatus(fileItem.Status),
			Title:     truncateDashboardText(title, 120),
			Summary:   truncateDashboardText(fileItem.Summary, 360),
			AgentID:   strings.TrimSpace(fileItem.AgentID),
			AgentName: strings.TrimSpace(fileItem.AgentName),
			Priority:  normalizeDashboardPriority(fileItem.Priority),
			Source:    source,
			CreatedAt: normalizeDashboardTime(fileItem.CreatedAt),
			UpdatedAt: normalizeDashboardTime(fileItem.UpdatedAt),
			DueAt:     normalizeDashboardTime(fileItem.DueAt),
			Tags:      cleanDashboardTags(fileItem.Tags),
			Metrics:   cleanDashboardMetrics(fileItem.Metrics),
			Artifacts: normalizeExplicitDashboardArtifacts(fileItem.Artifacts),
		})
	}
	return items
}

func loadDashboardMemoryItems(
	workspace string,
	health *agentDashboardHealth,
	agentMap map[string]*agentDashboardAgent,
) []agentDashboardItem {
	memoryDir := filepath.Join(workspace, "memory")
	missingMemory := true
	if _, err := os.Stat(memoryDir); err == nil {
		missingMemory = false
	}
	if missingMemory {
		health.MissingSources = append(health.MissingSources, agentDashboardSourceMemory)
		return nil
	}
	melhorias := loadDashboardMelhorias(filepath.Join(memoryDir, "melhorias.md"), health)
	relatorios := loadDashboardRelatoriosIndex(filepath.Join(memoryDir, "relatorios.md"), health, agentMap)
	padroes := loadDashboardPadroes(filepath.Join(memoryDir, "padroes.md"), health, agentMap)
	items := make(
		[]agentDashboardItem,
		0,
		len(melhorias)+len(relatorios)+len(padroes),
	)
	items = append(items, melhorias...)
	items = append(items, relatorios...)
	items = append(items, padroes...)
	return items
}

func loadDashboardMelhorias(path string, health *agentDashboardHealth) []agentDashboardItem {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			health.MissingSources = append(health.MissingSources, "workspace/memory/melhorias.md")
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("workspace/memory/melhorias.md: %v", err))
		return nil
	}
	chunks := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n---")
	items := make([]agentDashboardItem, 0, len(chunks))
	for index, chunk := range chunks {
		id := markdownField(chunk, "id")
		perceived := markdownBlock(chunk, "O que foi percebido", "O que foi feito")
		done := markdownBlock(chunk, "O que foi feito")
		title := firstNonEmpty(perceived, done)
		if id == "" && title == "" {
			continue
		}
		if id == "" {
			id = fmt.Sprintf("melhoria-%d", index+1)
		}
		if title == "" {
			title = id
		}
		items = append(items, agentDashboardItem{
			ID:     id,
			Type:   "suggestion",
			Status: normalizeDashboardStatus(markdownField(chunk, "status")),
			Title:  truncateDashboardText(title, 140),
			Summary: truncateDashboardText(
				firstNonEmpty(markdownBlock(chunk, "Sugestão", "Sugestao"), markdownBlock(chunk, "Por que importa")),
				360,
			),
			AgentName: markdownField(chunk, "Agente recomendado"),
			Priority:  normalizeDashboardPriority(firstNonEmpty(markdownField(chunk, "Prioridade"), chunk)),
			Source:    "workspace/memory/melhorias.md",
			CreatedAt: normalizeDashboardDate(markdownField(chunk, "data")),
			UpdatedAt: normalizeDashboardDate(markdownField(chunk, "data")),
		})
	}
	return items
}

func loadDashboardRelatoriosIndex(
	path string,
	health *agentDashboardHealth,
	agentMap map[string]*agentDashboardAgent,
) []agentDashboardItem {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			health.MissingSources = append(health.MissingSources, "workspace/memory/relatorios.md")
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("workspace/memory/relatorios.md: %v", err))
		return nil
	}
	items := make([]agentDashboardItem, 0)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || strings.Contains(line, "---") {
			continue
		}
		cells := splitMarkdownTableRow(line)
		if len(cells) < 4 || strings.EqualFold(cells[0], "Período") || cells[2] == "—" {
			continue
		}
		agentID, agentName := dashboardAgentRefFromText("Rafael", agentMap)
		items = append(items, agentDashboardItem{
			ID:        "relatorio-" + sanitizeDashboardID(cells[0]+"-"+cells[1]),
			Type:      "report",
			Status:    "done",
			Title:     truncateDashboardText(cells[0]+" - "+cells[1], 120),
			Summary:   truncateDashboardText(cells[3], 280),
			AgentID:   agentID,
			AgentName: firstNonEmpty(agentName, "Rafael"),
			Source:    "workspace/memory/relatorios.md",
			CreatedAt: normalizeDashboardDate(cells[1]),
			UpdatedAt: normalizeDashboardDate(cells[1]),
		})
	}
	return items
}

func loadDashboardPadroes(
	path string,
	health *agentDashboardHealth,
	agentMap map[string]*agentDashboardAgent,
) []agentDashboardItem {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			health.MissingSources = append(health.MissingSources, "workspace/memory/padroes.md")
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("workspace/memory/padroes.md: %v", err))
		return nil
	}
	content := string(data)
	week := markdownInlineBoldValue(content, "Semana")
	generated := markdownInlineBoldValue(content, "Gerado em")
	if week == "" || week == "—" || generated == "—" {
		return nil
	}
	agentID, agentName := dashboardAgentRefFromText("Rafael", agentMap)
	return []agentDashboardItem{{
		ID:        "padroes-" + sanitizeDashboardID(week),
		Type:      "analysis",
		Status:    "done",
		Title:     "Padrões detectados - " + week,
		Summary:   truncateDashboardText(markdownSectionText(content, "Último relatório de padrões"), 360),
		AgentID:   agentID,
		AgentName: firstNonEmpty(agentName, "Rafael"),
		Source:    "workspace/memory/padroes.md",
		CreatedAt: normalizeDashboardTime(generated),
		UpdatedAt: normalizeDashboardTime(generated),
	}}
}

type agentDashboardGeneratedSource struct {
	Source        string
	Type          string
	DefaultStatus string
}

func loadDashboardGeneratedItems(
	workspace string,
	health *agentDashboardHealth,
	agentMap map[string]*agentDashboardAgent,
) []agentDashboardItem {
	sources := []agentDashboardGeneratedSource{
		{Source: agentDashboardSourceOutputReports, Type: "report", DefaultStatus: "done"},
		{Source: agentDashboardSourceOutputPlans, Type: "task", DefaultStatus: "pending"},
		{Source: agentDashboardSourceOutputData, Type: "metric", DefaultStatus: "done"},
		{Source: agentDashboardSourceOutputAnalytics, Type: "metric", DefaultStatus: "done"},
		{Source: agentDashboardSourceTestReports, Type: "report", DefaultStatus: "done"},
	}
	items := make([]agentDashboardItem, 0)
	for _, source := range sources {
		root := filepath.Join(workspace, filepath.FromSlash(strings.TrimPrefix(source.Source, "workspace/")))
		if _, err := os.Stat(root); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				health.MissingSources = append(health.MissingSources, source.Source)
				continue
			}
			health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", source.Source, err))
			continue
		}
		err := filepath.WalkDir(root, func(file string, entry os.DirEntry, err error) error {
			if err != nil {
				health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", source.Source, err))
				return nil
			}
			if entry.IsDir() || !allowedDashboardItemFileExt(filepath.Ext(entry.Name())) {
				return nil
			}
			info, infoErr := entry.Info()
			if infoErr != nil {
				health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", source.Source, infoErr))
				return nil
			}
			item, ok := dashboardItemFromGeneratedFile(workspace, file, info, source, agentMap)
			if ok {
				items = append(items, item)
			}
			return nil
		})
		if err != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", source.Source, err))
		}
	}
	return items
}

func dashboardItemFromGeneratedFile(
	workspace string,
	file string,
	info os.FileInfo,
	generated agentDashboardGeneratedSource,
	agentMap map[string]*agentDashboardAgent,
) (agentDashboardItem, bool) {
	rel, err := filepath.Rel(workspace, filepath.Clean(file))
	if err != nil || rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." {
		return agentDashboardItem{}, false
	}
	rel = filepath.ToSlash(rel)
	source := "workspace/" + rel
	content, _ := readDashboardFileSnippet(file, 256*1024)
	fields := dashboardMetadataFromGeneratedContent(content)
	title := firstNonEmpty(
		fields["title"],
		fields["titulo"],
		fields["título"],
		fields["name"],
		fields["nome"],
		markdownHeading(content),
		dashboardArtifactTitle(rel),
	)
	if title == "" {
		return agentDashboardItem{}, false
	}
	summary := firstNonEmpty(
		fields["summary"],
		fields["resumo"],
		fields["description"],
		fields["descrição"],
		fields["descricao"],
		markdownSummary(content),
	)
	agentRef := firstNonEmpty(
		fields["agent"],
		fields["agente"],
		fields["agent_name"],
		fields["agente recomendado"],
		fields["responsável"],
		fields["responsavel"],
		fields["owner"],
		source+" "+title+" "+content,
	)
	agentID, agentName := dashboardAgentRefFromText(agentRef, agentMap)
	item := agentDashboardItem{
		ID:        generated.Type + "-" + sanitizeDashboardID(rel),
		Type:      normalizeDashboardType(firstNonEmpty(fields["type"], fields["tipo"], generated.Type)),
		Status:    normalizeDashboardStatus(firstNonEmpty(fields["status"], generated.DefaultStatus)),
		Title:     truncateDashboardText(title, 140),
		Summary:   truncateDashboardText(summary, 360),
		AgentID:   agentID,
		AgentName: agentName,
		Priority:  normalizeDashboardPriority(fields["priority"] + " " + fields["prioridade"]),
		Source:    source,
		CreatedAt: normalizeDashboardTime(firstNonEmpty(
			fields["created_at"],
			fields["created"],
			fields["criado em"],
			fields["data"],
			fields["gerado em"],
			info.ModTime().UTC().Format(time.RFC3339),
		)),
		UpdatedAt: normalizeDashboardTime(firstNonEmpty(
			fields["updated_at"],
			fields["updated"],
			fields["atualizado em"],
			fields["data"],
			fields["gerado em"],
			info.ModTime().UTC().Format(time.RFC3339),
		)),
	}
	if item.Type == "task" {
		item.DueAt = normalizeDashboardTime(firstNonEmpty(fields["due_at"], fields["prazo"], fields["vence em"]))
	}
	if artifact, ok := dashboardArtifactFromWorkspaceFile(workspace, file, info, agentMap); ok {
		item.Artifacts = []agentDashboardArtifact{artifact}
	}
	return item, true
}

func loadDashboardOutputArtifacts(
	workspace string,
	health *agentDashboardHealth,
	agentMap map[string]*agentDashboardAgent,
) []agentDashboardArtifact {
	root := filepath.Join(workspace, "output")
	if _, err := os.Stat(root); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("workspace/output: %v", err))
		return nil
	}
	artifacts := make([]agentDashboardArtifact, 0)
	err := filepath.WalkDir(root, func(file string, entry os.DirEntry, err error) error {
		if err != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("workspace/output: %v", err))
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("workspace/output: %v", infoErr))
			return nil
		}
		artifact, ok := dashboardArtifactFromWorkspaceFile(workspace, file, info, agentMap)
		if ok {
			artifacts = append(artifacts, artifact)
		}
		return nil
	})
	if err != nil {
		health.Errors = append(health.Errors, fmt.Sprintf("workspace/output: %v", err))
	}
	sort.SliceStable(artifacts, func(i, j int) bool {
		return firstNonEmpty(artifacts[i].CreatedAt, artifacts[i].ID) >
			firstNonEmpty(artifacts[j].CreatedAt, artifacts[j].ID)
	})
	if len(artifacts) > 24 {
		artifacts = artifacts[:24]
	}
	return artifacts
}

func allowedDashboardItemFileExt(ext string) bool {
	switch strings.ToLower(strings.TrimSpace(ext)) {
	case ".md", ".txt", ".json", ".jsonl", ".csv":
		return true
	default:
		return false
	}
}

func readDashboardFileSnippet(file string, limit int64) (string, error) {
	if limit <= 0 {
		limit = 256 * 1024
	}
	handle, err := os.Open(file)
	if err != nil {
		return "", err
	}
	defer handle.Close()
	data, err := io.ReadAll(io.LimitReader(handle, limit))
	if err != nil {
		return "", err
	}
	return strings.ReplaceAll(string(data), "\r\n", "\n"), nil
}

func dashboardMetadataFromGeneratedContent(content string) map[string]string {
	fields := map[string]string{}
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return fields
	}
	var raw map[string]any
	if strings.HasPrefix(trimmed, "{") && json.Unmarshal([]byte(trimmed), &raw) == nil {
		for key, value := range raw {
			if text := anyDashboardString(value); text != "" {
				fields[cleanDashboardFieldKey(key)] = text
			}
		}
		return fields
	}
	for _, line := range strings.Split(trimmed, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "{") && json.Unmarshal([]byte(line), &raw) == nil {
			for key, value := range raw {
				if text := anyDashboardString(value); text != "" {
					fields[cleanDashboardFieldKey(key)] = text
				}
			}
			return fields
		}
		break
	}
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = cleanDashboardFieldKey(key)
		value = strings.TrimSpace(strings.Trim(value, "`* "))
		if key != "" && value != "" && len(value) <= 500 {
			fields[key] = value
		}
	}
	return fields
}

func cleanDashboardFieldKey(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, "*`# ")
	return strings.ToLower(strings.TrimSpace(value))
}

func markdownHeading(content string) string {
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "#") {
			continue
		}
		return strings.TrimSpace(strings.TrimLeft(line, "# "))
	}
	return ""
}

func markdownSummary(content string) string {
	inCodeBlock := false
	out := make([]string, 0, 3)
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		if strings.HasPrefix(line, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}
		if inCodeBlock ||
			line == "" ||
			strings.HasPrefix(line, "#") ||
			strings.HasPrefix(line, "|") ||
			strings.HasPrefix(line, "---") ||
			strings.HasPrefix(line, "<!--") ||
			dashboardLooksLikeMarkdownField(line) {
			continue
		}
		out = append(out, strings.TrimPrefix(line, "- "))
		if len(out) >= 3 {
			break
		}
	}
	return strings.Join(out, " ")
}

func loadDashboardAgentProposals(cfg *config.Config, health *agentDashboardHealth) []agentDashboardItem {
	items := make([]agentDashboardItem, 0)
	for _, agent := range cfg.Agents.List {
		agentID := orchestrator.CanonicalAgentID(agent.ID)
		workspace := strings.TrimSpace(agent.Workspace)
		if workspace == "" {
			continue
		}
		dir := filepath.Join(workspace, "proposals")
		files, err := filepath.Glob(filepath.Join(dir, "*.json"))
		if err != nil {
			health.Errors = append(health.Errors, fmt.Sprintf("agent:%s/proposals: %v", agentID, err))
			continue
		}
		for _, file := range files {
			data, err := os.ReadFile(file)
			if err != nil {
				health.Errors = append(
					health.Errors,
					fmt.Sprintf("agent:%s/proposals/%s: %v", agentID, filepath.Base(file), err),
				)
				continue
			}
			item, ok := parseDashboardProposal(data, agentID, firstNonEmpty(agent.Name, agent.ID), filepath.Base(file))
			if !ok {
				health.Errors = append(
					health.Errors,
					fmt.Sprintf("agent:%s/proposals/%s: invalid proposal", agentID, filepath.Base(file)),
				)
				continue
			}
			items = append(items, item)
		}
	}
	return items
}

func parseDashboardProposal(data []byte, agentID, agentName, filename string) (agentDashboardItem, bool) {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return agentDashboardItem{}, false
	}
	id := firstNonEmpty(anyDashboardString(raw["id"]), strings.TrimSuffix(filename, filepath.Ext(filename)))
	title := firstNonEmpty(
		anyDashboardString(raw["title"]),
		anyDashboardString(raw["name"]),
		anyDashboardString(raw["headline"]),
	)
	summary := firstNonEmpty(
		anyDashboardString(raw["summary"]),
		anyDashboardString(raw["description"]),
		anyDashboardString(raw["content"]),
		anyDashboardString(raw["body"]),
	)
	if title == "" {
		title = firstDashboardSentence(summary)
	}
	if title == "" {
		return agentDashboardItem{}, false
	}
	return agentDashboardItem{
		ID:        "proposal-" + sanitizeDashboardID(id),
		Type:      normalizeDashboardType(firstNonEmpty(anyDashboardString(raw["type"]), "suggestion")),
		Status:    normalizeDashboardStatus(anyDashboardString(raw["status"])),
		Title:     truncateDashboardText(title, 140),
		Summary:   truncateDashboardText(summary, 360),
		AgentID:   agentID,
		AgentName: agentName,
		Priority:  normalizeDashboardPriority(anyDashboardString(raw["priority"])),
		Source:    filepath.ToSlash(filepath.Join("agent:"+agentID, "proposals", filename)),
		CreatedAt: normalizeDashboardTime(anyDashboardString(raw["created_at"])),
		UpdatedAt: normalizeDashboardTime(anyDashboardString(raw["updated_at"])),
		Artifacts: dashboardArtifactsFromProposal(raw, agentID, agentName),
	}, true
}

func loadDashboardCronTasks(workspace string, health *agentDashboardHealth) []agentDashboardTask {
	path := filepath.Join(workspace, "cron", "jobs.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			health.MissingSources = append(health.MissingSources, agentDashboardSourceCron)
			return nil
		}
		health.Errors = append(health.Errors, fmt.Sprintf("%s: %v", agentDashboardSourceCron, err))
		return nil
	}
	var store agentDashboardCronStore
	if err := json.Unmarshal(data, &store); err != nil {
		health.Errors = append(health.Errors, fmt.Sprintf("%s: invalid JSON", agentDashboardSourceCron))
		return nil
	}
	tasks := make([]agentDashboardTask, 0, len(store.Jobs))
	for index, rawJob := range store.Jobs {
		var job agentDashboardCronJob
		if err := json.Unmarshal(rawJob, &job); err != nil {
			health.Errors = append(
				health.Errors,
				fmt.Sprintf("%s: invalid job at index %d", agentDashboardSourceCron, index),
			)
			continue
		}
		if strings.TrimSpace(job.ID) == "" || strings.TrimSpace(job.Name) == "" {
			health.Errors = append(
				health.Errors,
				fmt.Sprintf("%s: ignored job at index %d without id/name", agentDashboardSourceCron, index),
			)
			continue
		}
		status := "dismissed"
		if job.Enabled {
			status = "scheduled"
		}
		tasks = append(tasks, agentDashboardTask{
			ID:        job.ID,
			Title:     truncateDashboardText(job.Name, 140),
			Status:    status,
			AgentID:   orchestrator.CanonicalAgentID(job.Payload.AgentID),
			Source:    agentDashboardSourceCron,
			Schedule:  dashboardCronScheduleText(job.Schedule),
			NextRunAt: dashboardCronNextRun(job.State),
			UpdatedAt: dashboardMillisTime(job.UpdatedAtMs),
		})
	}
	return tasks
}

func addAgentDashboardAgent(agentMap map[string]*agentDashboardAgent, id, name, role string, active bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		id = sanitizeDashboardID(name)
	}
	if id == "" {
		return
	}
	if existing, ok := agentMap[id]; ok {
		if existing.Name == "" {
			existing.Name = name
		}
		if existing.Role == "" || existing.Role == "Agente interno" {
			existing.Role = role
		}
		existing.Active = existing.Active || active
		return
	}
	for _, existing := range agentMap {
		if dashboardAgentsReferToSamePerson(existing, id, name) {
			if existing.Name == "" || strings.EqualFold(existing.Name, existing.ID) {
				existing.Name = firstNonEmpty(name, existing.Name)
			}
			if existing.Role == "" || existing.Role == "Agente interno" {
				existing.Role = role
			}
			existing.Active = existing.Active || active
			return
		}
	}
	agentMap[id] = &agentDashboardAgent{
		ID:     id,
		Name:   firstNonEmpty(name, id),
		Role:   firstNonEmpty(role, "Agente"),
		Active: active,
	}
}

func dashboardAgentsReferToSamePerson(existing *agentDashboardAgent, id, name string) bool {
	if existing == nil {
		return false
	}
	if strings.EqualFold(existing.Name, name) && strings.TrimSpace(name) != "" {
		return true
	}
	refID, _ := dashboardAgentRefFromText(strings.Join([]string{id, name}, " "), map[string]*agentDashboardAgent{
		existing.ID: existing,
	})
	return refID == existing.ID
}

func findDashboardAgent(agentMap map[string]*agentDashboardAgent, agentID, agentName string) *agentDashboardAgent {
	if agentID != "" {
		if agent, ok := agentMap[agentID]; ok {
			return agent
		}
	}
	if agentName == "" {
		return nil
	}
	for _, agent := range agentMap {
		if strings.EqualFold(agent.Name, agentName) {
			return agent
		}
	}
	if id, _ := dashboardAgentRefFromText(agentName, agentMap); id != "" {
		return agentMap[id]
	}
	return nil
}

func reconcileDashboardItemAgents(items []agentDashboardItem, agentMap map[string]*agentDashboardAgent) {
	for i := range items {
		agentID, agentName := dashboardAgentRefFromText(
			strings.Join([]string{
				items[i].AgentID,
				items[i].AgentName,
				items[i].Source,
				items[i].Title,
				items[i].Summary,
			}, " "),
			agentMap,
		)
		if agentID != "" {
			items[i].AgentID = agentID
			items[i].AgentName = agentName
		}
	}
}

func reconcileDashboardTaskAgents(tasks []agentDashboardTask, agentMap map[string]*agentDashboardAgent) {
	for i := range tasks {
		agentID, agentName := dashboardAgentRefFromText(
			strings.Join([]string{
				tasks[i].AgentID,
				tasks[i].AgentName,
				tasks[i].Source,
				tasks[i].Title,
			}, " "),
			agentMap,
		)
		if agentID != "" {
			tasks[i].AgentID = agentID
			tasks[i].AgentName = agentName
		}
	}
}

func reconcileDashboardArtifactAgents(artifacts []agentDashboardArtifact, agentMap map[string]*agentDashboardAgent) {
	for i := range artifacts {
		agentID, agentName := dashboardAgentRefFromText(
			strings.Join([]string{
				artifacts[i].AgentID,
				artifacts[i].AgentName,
				artifacts[i].Source,
				artifacts[i].Title,
			}, " "),
			agentMap,
		)
		if agentID != "" {
			artifacts[i].AgentID = agentID
			artifacts[i].AgentName = agentName
		}
	}
}

func dashboardAgentRefFromText(value string, agentMap map[string]*agentDashboardAgent) (string, string) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "", ""
	}
	type match struct {
		id     string
		name   string
		index  int
		length int
	}
	best := match{index: len(value) + 1}
	for _, agent := range sortedDashboardAgentPointers(agentMap) {
		for _, token := range dashboardAgentTokens(agent.ID, agent.Name) {
			if token == "" {
				continue
			}
			if index := strings.Index(value, token); index >= 0 &&
				(index < best.index || (index == best.index && len(token) > best.length)) {
				best = match{id: agent.ID, name: agent.Name, index: index, length: len(token)}
			}
		}
	}
	if best.id != "" {
		return best.id, best.name
	}
	for _, fallback := range dashboardFallbackAgentRefs() {
		for _, token := range fallback.tokens {
			if index := strings.Index(value, token); index >= 0 &&
				(index < best.index || (index == best.index && len(token) > best.length)) {
				best = match{id: fallback.id, name: fallback.name, index: index, length: len(token)}
			}
		}
	}
	if best.id != "" {
		return best.id, best.name
	}
	return "", ""
}

func sortedDashboardAgentPointers(agentMap map[string]*agentDashboardAgent) []*agentDashboardAgent {
	agents := make([]*agentDashboardAgent, 0, len(agentMap))
	for _, agent := range agentMap {
		agents = append(agents, agent)
	}
	sort.SliceStable(agents, func(i, j int) bool {
		return strings.ToLower(agents[i].Name) < strings.ToLower(agents[j].Name)
	})
	return agents
}

func dashboardAgentTokens(id, name string) []string {
	tokens := []string{
		strings.ToLower(strings.TrimSpace(id)),
		strings.ToLower(strings.TrimSpace(name)),
	}
	if first, _, ok := strings.Cut(name, " "); ok {
		tokens = append(tokens, strings.ToLower(strings.TrimSpace(first)))
	}
	for _, part := range strings.FieldsFunc(id+" "+name, func(r rune) bool {
		return r == '-' || r == '_' || r == '/' || r == ' '
	}) {
		if part = strings.ToLower(strings.TrimSpace(part)); len(part) >= 3 || part == "qa" {
			tokens = append(tokens, part)
		}
	}
	for _, fallback := range dashboardFallbackAgentRefs() {
		if strings.EqualFold(id, fallback.id) ||
			strings.Contains(strings.ToLower(name), strings.ToLower(fallback.name)) ||
			strings.Contains(strings.ToLower(id), strings.ToLower(fallback.id)) {
			tokens = append(tokens, fallback.tokens...)
		}
	}
	return cleanDashboardTags(tokens)
}

func dashboardFallbackAgentRefs() []struct {
	id     string
	name   string
	tokens []string
} {
	return []struct {
		id     string
		name   string
		tokens []string
	}{
		{
			id:   "rafael",
			name: "Rafael",
			tokens: []string{
				"rafael",
				"assistente interno",
				"interno",
				"analytics",
				"padroes",
				"padrões",
				"relatorio diario",
				"relatório diário",
			},
		},
		{id: "clara", name: "Clara", tokens: []string{"clara", "atendente principal", "atendimento inicial"}},
		{id: "luna", name: "Luna", tokens: []string{"luna", "noturna", "fim de semana"}},
		{id: "marcos", name: "Marcos", tokens: []string{"marcos", "vendas", "sales", "comercial"}},
		{id: "camila", name: "Camila", tokens: []string{"camila", "suporte", "pos-venda", "pós-venda", "support"}},
		{id: "lia", name: "Lia", tokens: []string{"lia", "marketing", "campanha", "instagram", "conteudo", "conteúdo"}},
		{id: "sofia", name: "Sofia", tokens: []string{"sofia", "onboarding", "discovery", "cadastro"}},
		{id: "catarina", name: "Catarina", tokens: []string{"catarina", "aprofundamento", "aprofundar", "curadoria"}},
		{id: "operador", name: "Operador", tokens: []string{"operador", "operator", "dev", "tecnico", "técnico"}},
		{id: "qa-tester", name: "QA Tester", tokens: []string{"qa-tester", "qa tester", "qa", "teste", "testes"}},
		{
			id:     "transferencia-humana",
			name:   "Atendimento Humano",
			tokens: []string{"atendimento humano", "humano", "transferencia", "transferência"},
		},
	}
}

func normalizeDashboardItems(items []agentDashboardItem) {
	for i := range items {
		items[i].Type = normalizeDashboardType(items[i].Type)
		items[i].Status = normalizeDashboardStatus(items[i].Status)
		items[i].Priority = normalizeDashboardPriority(items[i].Priority)
		items[i].Title = truncateDashboardText(firstNonEmpty(items[i].Title, items[i].ID), 140)
		items[i].Summary = truncateDashboardText(items[i].Summary, 360)
	}
}

func normalizeDashboardType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "result", "analysis", "suggestion", "report", "metric", "task":
		return strings.ToLower(strings.TrimSpace(value))
	case "analise", "análise", "analytics", "pattern", "patterns":
		return "analysis"
	case "sugestao", "sugestão", "melhoria", "proposal":
		return "suggestion"
	case "relatorio", "relatório":
		return "report"
	case "metrica", "métrica":
		return "metric"
	case "tarefa":
		return "task"
	default:
		return "result"
	}
}

func normalizeDashboardStatus(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch {
	case normalized == "new" || strings.Contains(normalized, "novo"):
		return "new"
	case normalized == "pending" || normalized == "pendente" || strings.Contains(normalized, "a fazer"):
		return "pending"
	case normalized == "in_progress" || strings.Contains(normalized, "andamento"):
		return "in_progress"
	case normalized == "scheduled" || strings.Contains(normalized, "agend"):
		return "scheduled"
	case normalized == "implemented" || strings.Contains(normalized, "implementado"):
		return "implemented"
	case normalized == "done" || strings.Contains(normalized, "conclu") || strings.Contains(normalized, "feito"):
		return "done"
	case normalized == "dismissed" || strings.Contains(normalized, "descart"):
		return "dismissed"
	default:
		return "new"
	}
}

func normalizeDashboardPriority(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch {
	case strings.Contains(normalized, "crit"):
		return "critical"
	case strings.Contains(normalized, "alta") || strings.Contains(normalized, "high"):
		return "high"
	case strings.Contains(normalized, "media") || strings.Contains(normalized, "média") || strings.Contains(normalized, "medium"):
		return "medium"
	case strings.Contains(normalized, "baixa") || strings.Contains(normalized, "low"):
		return "low"
	default:
		return ""
	}
}

func dashboardPriorityRank(priority string) int {
	switch priority {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

func isDashboardPendingStatus(status string) bool {
	return status == "new" || status == "pending" || status == "in_progress" || status == "scheduled"
}

func dashboardSortStamp(item agentDashboardItem) string {
	return firstNonEmpty(item.UpdatedAt, item.CreatedAt, item.DueAt, item.ID)
}

func markdownField(content, field string) string {
	field = strings.ToLower(strings.TrimSpace(field))
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(key), field) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func markdownBlock(content string, labels ...string) string {
	lines := strings.Split(content, "\n")
	for i, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		key, _, ok := strings.Cut(line, ":")
		if !ok || !matchesDashboardLabel(key, labels...) {
			continue
		}
		var out []string
		for _, nextRaw := range lines[i+1:] {
			next := strings.TrimSpace(nextRaw)
			if next == "" {
				if len(out) > 0 {
					break
				}
				continue
			}
			if dashboardLooksLikeMarkdownField(next) {
				break
			}
			out = append(out, next)
		}
		return strings.Join(out, " ")
	}
	return ""
}

func matchesDashboardLabel(value string, labels ...string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	for _, label := range labels {
		if value == strings.ToLower(strings.TrimSpace(label)) {
			return true
		}
	}
	return false
}

func dashboardLooksLikeMarkdownField(line string) bool {
	key, _, ok := strings.Cut(line, ":")
	if !ok {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "id",
		"data",
		"origem",
		"status",
		"prioridade",
		"priority",
		"tipo",
		"type",
		"titulo",
		"título",
		"title",
		"nome",
		"name",
		"resumo",
		"summary",
		"descrição",
		"descricao",
		"description",
		"agente",
		"agent",
		"agent_name",
		"responsável",
		"responsavel",
		"owner",
		"agente recomendado",
		"o que foi percebido",
		"o que foi feito",
		"por que importa",
		"sugestão",
		"sugestao",
		"arquivos criados/modificados":
		return true
	default:
		return false
	}
}

func splitMarkdownTableRow(line string) []string {
	line = strings.Trim(line, "|")
	parts := strings.Split(line, "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cells = append(cells, strings.TrimSpace(part))
	}
	return cells
}

func markdownInlineBoldValue(content, label string) string {
	prefix := "**" + label + "**:"
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

func markdownSectionText(content, title string) string {
	lines := strings.Split(content, "\n")
	inSection := false
	out := make([]string, 0)
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "## ") {
			inSection = strings.Contains(line, title)
			continue
		}
		if inSection {
			if strings.HasPrefix(line, "## ") {
				break
			}
			if line != "" && !strings.HasPrefix(line, "<!--") {
				out = append(out, line)
			}
		}
	}
	return strings.Join(out, " ")
}

func dashboardCronScheduleText(schedule agentDashboardCronSchedule) string {
	switch strings.ToLower(strings.TrimSpace(schedule.Kind)) {
	case "cron":
		return strings.TrimSpace(strings.Join([]string{schedule.Expr, schedule.TZ}, " "))
	case "every":
		if schedule.EveryMS != nil {
			return fmt.Sprintf("every %dms", *schedule.EveryMS)
		}
	}
	return strings.TrimSpace(schedule.Kind)
}

func dashboardCronNextRun(state map[string]json.RawMessage) string {
	if state == nil {
		return ""
	}
	raw, ok := state["nextRunAtMs"]
	if !ok {
		return ""
	}
	var asNumber float64
	if err := json.Unmarshal(raw, &asNumber); err == nil && asNumber > 0 {
		return dashboardMillisTime(int64(asNumber))
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		if parsed, err := strconv.ParseInt(asString, 10, 64); err == nil {
			return dashboardMillisTime(parsed)
		}
	}
	return ""
}

func dashboardMillisTime(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}

func normalizeDashboardDate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "—" {
		return ""
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.UTC().Format(time.RFC3339)
	}
	return normalizeDashboardTime(value)
}

func normalizeDashboardTime(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "—" {
		return ""
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format(time.RFC3339)
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.UTC().Format(time.RFC3339)
	}
	return value
}

func cleanDashboardTags(tags []string) []string {
	cleaned := make([]string, 0, len(tags))
	seen := map[string]struct{}{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		cleaned = append(cleaned, tag)
	}
	sort.Strings(cleaned)
	return cleaned
}

func cleanDashboardMetrics(metrics map[string]string) map[string]string {
	if len(metrics) == 0 {
		return nil
	}
	cleaned := map[string]string{}
	for key, value := range metrics {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key != "" && value != "" {
			cleaned[key] = truncateDashboardText(value, 120)
		}
	}
	if len(cleaned) == 0 {
		return nil
	}
	return cleaned
}

func normalizeDashboardArtifacts(artifacts []agentDashboardArtifact) []agentDashboardArtifact {
	seen := map[string]struct{}{}
	out := make([]agentDashboardArtifact, 0, len(artifacts))
	for _, artifact := range artifacts {
		artifact.ID = firstNonEmpty(
			strings.TrimSpace(artifact.ID),
			sanitizeDashboardID(artifact.Source),
			sanitizeDashboardID(artifact.URL),
		)
		artifact.Type = normalizeDashboardArtifactType(artifact.Type, artifact.URL, artifact.Source)
		artifact.Title = truncateDashboardText(
			firstNonEmpty(artifact.Title, dashboardArtifactTitle(artifact.Source), artifact.URL),
			120,
		)
		artifact.Source = truncateDashboardText(strings.TrimSpace(artifact.Source), 240)
		artifact.URL = strings.TrimSpace(artifact.URL)
		artifact.AgentID = truncateDashboardText(strings.TrimSpace(artifact.AgentID), 120)
		artifact.AgentName = truncateDashboardText(strings.TrimSpace(artifact.AgentName), 160)
		artifact.CreatedAt = normalizeDashboardTime(artifact.CreatedAt)
		if artifact.ID == "" || artifact.URL == "" || artifact.Title == "" {
			continue
		}
		key := artifact.Type + ":" + artifact.URL
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, artifact)
	}
	return out
}

func normalizeExplicitDashboardArtifacts(artifacts []agentDashboardArtifact) []agentDashboardArtifact {
	if len(artifacts) == 0 {
		return nil
	}
	cleaned := append([]agentDashboardArtifact(nil), artifacts...)
	cleaned = normalizeDashboardArtifacts(cleaned)
	if len(cleaned) == 0 {
		return nil
	}
	return cleaned
}

func dashboardArtifactFromWorkspaceFile(
	workspace string,
	file string,
	info os.FileInfo,
	agentMap map[string]*agentDashboardAgent,
) (agentDashboardArtifact, bool) {
	ext := strings.ToLower(filepath.Ext(file))
	kind := normalizeDashboardArtifactType("", "", file)
	if kind == "" || !allowedDashboardArtifactExt(ext) {
		return agentDashboardArtifact{}, false
	}
	rel, err := filepath.Rel(workspace, filepath.Clean(file))
	if err != nil || rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." {
		return agentDashboardArtifact{}, false
	}
	rel = filepath.ToSlash(rel)
	if !strings.HasPrefix(rel, "output/") {
		return agentDashboardArtifact{}, false
	}
	agentID, agentName := dashboardAgentRefFromText(rel, agentMap)
	return agentDashboardArtifact{
		ID:        "artifact-" + sanitizeDashboardID(rel),
		Type:      kind,
		Title:     dashboardArtifactTitle(rel),
		Source:    "workspace/" + rel,
		URL:       "/api/agent-dashboard/artifacts/" + escapeDashboardArtifactPath(rel),
		AgentID:   agentID,
		AgentName: agentName,
		CreatedAt: info.ModTime().UTC().Format(time.RFC3339),
	}, true
}

func dashboardArtifactsFromProposal(raw map[string]any, agentID, agentName string) []agentDashboardArtifact {
	urls := anyDashboardStringSlice(raw["public_urls"])
	if len(urls) == 0 {
		urls = anyDashboardStringSlice(raw["urls"])
	}
	artifacts := make([]agentDashboardArtifact, 0, len(urls))
	for index, value := range urls {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		artifacts = append(artifacts, agentDashboardArtifact{
			ID:        fmt.Sprintf("proposal-url-%d-%s", index+1, sanitizeDashboardID(value)),
			Type:      normalizeDashboardArtifactType("site", value, ""),
			Title:     dashboardArtifactTitle(value),
			Source:    "agent:" + agentID + "/proposals",
			URL:       value,
			AgentID:   agentID,
			AgentName: agentName,
		})
	}
	return normalizeExplicitDashboardArtifacts(artifacts)
}

func normalizeDashboardArtifactType(kind, urlValue, source string) string {
	normalized := strings.ToLower(strings.TrimSpace(kind))
	switch normalized {
	case "image", "document", "site", "link", "service", "file":
		return normalized
	}
	target := strings.ToLower(strings.TrimSpace(firstNonEmpty(source, urlValue)))
	ext := strings.ToLower(filepath.Ext(target))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg":
		return "image"
	case ".html", ".htm":
		return "site"
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".md", ".txt", ".csv":
		return "document"
	}
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return "link"
	}
	return ""
}

func allowedDashboardArtifactExt(ext string) bool {
	switch strings.ToLower(strings.TrimSpace(ext)) {
	case ".png",
		".jpg",
		".jpeg",
		".webp",
		".gif",
		".svg",
		".html",
		".htm",
		".pdf",
		".doc",
		".docx",
		".xls",
		".xlsx",
		".ppt",
		".pptx",
		".md",
		".txt",
		".csv":
		return true
	default:
		return false
	}
}

func dashboardArtifactTitle(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if parsed, err := url.Parse(value); err == nil && parsed.Host != "" {
		return parsed.Host
	}
	base := filepath.Base(filepath.FromSlash(value))
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " "))
	if base == "" || strings.EqualFold(base, "index") {
		parent := filepath.Base(filepath.Dir(filepath.FromSlash(value)))
		base = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(parent, "-", " "), "_", " "))
	}
	return strings.Title(base)
}

func escapeDashboardArtifactPath(value string) string {
	parts := strings.Split(path.Clean("/"+strings.TrimSpace(value)), "/")
	escaped := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		escaped = append(escaped, url.PathEscape(part))
	}
	return strings.Join(escaped, "/")
}

func resolveAgentDashboardArtifactPath(workspace, asset string) (string, bool) {
	asset = strings.TrimSpace(asset)
	if decoded, err := url.PathUnescape(asset); err == nil {
		asset = decoded
	}
	asset = path.Clean("/" + asset)
	asset = strings.TrimPrefix(asset, "/")
	if asset == "" || asset == "." || strings.HasPrefix(asset, "../") {
		return "", false
	}
	if !strings.HasPrefix(asset, "output/") {
		return "", false
	}
	if !allowedDashboardArtifactExt(filepath.Ext(asset)) {
		return "", false
	}
	outputRoot := filepath.Join(workspace, "output")
	candidate := filepath.Clean(filepath.Join(workspace, filepath.FromSlash(asset)))
	if !isPathWithinDir(candidate, outputRoot) {
		return "", false
	}
	rootReal, rootErr := filepath.EvalSymlinks(outputRoot)
	candidateReal, candidateErr := filepath.EvalSymlinks(candidate)
	if rootErr == nil && candidateErr == nil && !isPathWithinDir(candidateReal, rootReal) {
		return "", false
	}
	return candidate, true
}

func saveAgentDashboardResponse(workspace string, response agentDashboardSavedResponse) error {
	dir := filepath.Join(workspace, "dashboard", "responses")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	file := filepath.Join(dir, response.ID+".json")
	data, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(file, data, 0o600)
}

func newAgentDashboardResponseID(itemID string) string {
	suffix := sanitizeDashboardID(itemID)
	if suffix == "" {
		suffix = "resposta"
	}
	return fmt.Sprintf("response-%s-%s", time.Now().UTC().Format("20060102-150405.000000000"), suffix)
}

func anyDashboardString(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func anyDashboardStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if item = strings.TrimSpace(item); item != "" {
				out = append(out, item)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := anyDashboardString(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func firstDashboardSentence(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	for _, sep := range []string{".", "\n"} {
		if idx := strings.Index(value, sep); idx > 0 {
			return strings.TrimSpace(value[:idx])
		}
	}
	return value
}

func truncateDashboardText(value string, limit int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if limit <= 0 || len([]rune(value)) <= limit {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:limit-1])) + "…"
}

func sanitizeDashboardID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		default:
			if b.Len() > 0 {
				b.WriteByte('-')
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
