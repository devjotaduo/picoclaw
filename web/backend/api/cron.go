package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/cron"
)

type cronJobsResponse struct {
	Workspace string         `json:"workspace"`
	StorePath string         `json:"store_path"`
	Jobs      []cron.CronJob `json:"jobs"`
}

func (h *Handler) registerCronRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/cron/jobs", h.handleListCronJobs)
}

func (h *Handler) handleListCronJobs(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	storePath := filepath.Join(workspace, "cron", "jobs.json")

	jobs, err := readCronStore(storePath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read cron store: %v", err), http.StatusInternalServerError)
		return
	}
	sort.SliceStable(jobs, func(i, j int) bool {
		// Active jobs first, then most-recently-updated.
		if jobs[i].Enabled != jobs[j].Enabled {
			return jobs[i].Enabled
		}
		return jobs[i].UpdatedAtMS > jobs[j].UpdatedAtMS
	})
	writeJSON(w, cronJobsResponse{
		Workspace: workspace,
		StorePath: filepath.ToSlash(storePath),
		Jobs:      jobs,
	})
}

func readCronStore(path string) ([]cron.CronJob, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []cron.CronJob{}, nil
		}
		return nil, err
	}
	var store cron.CronStore
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("decode cron store: %w", err)
	}
	if store.Jobs == nil {
		return []cron.CronJob{}, nil
	}
	return store.Jobs, nil
}
