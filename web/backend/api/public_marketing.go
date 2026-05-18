package api

import (
	"encoding/json"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
)

const publicMarketingPrefix = "/public/marketing/"

func (h *Handler) registerPublicMarketingRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /public/marketing/{asset...}", h.handlePublicMarketingAsset)
	mux.HandleFunc("HEAD /public/marketing/{asset...}", h.handlePublicMarketingAsset)
}

func (h *Handler) handlePublicMarketingAsset(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	agentCfg, ok := findAgentConfig(cfg, orchestrator.AgentMarketing)
	if !ok || strings.TrimSpace(agentCfg.Workspace) == "" {
		http.NotFound(w, r)
		return
	}
	root, ok := marketingPublicDir(agentCfg)
	if !ok {
		http.NotFound(w, r)
		return
	}
	asset := strings.TrimSpace(r.PathValue("asset"))
	file, ok := resolvePublicMarketingAsset(root, asset)
	if !ok {
		http.NotFound(w, r)
		return
	}
	info, err := os.Stat(file)
	if err != nil || info.IsDir() || !allowedPublicMarketingExt(filepath.Ext(file)) {
		http.NotFound(w, r)
		return
	}
	if ct := mime.TypeByExtension(filepath.Ext(file)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.ServeFile(w, r, file)
}

func marketingPublicDir(agent config.AgentConfig) (string, bool) {
	workspace := strings.TrimSpace(agent.Workspace)
	if workspace == "" {
		return "", false
	}
	dir := "public/marketing"
	if agent.RoleConfig != nil && agent.RoleConfig.Marketing != nil {
		if configured := strings.TrimSpace(agent.RoleConfig.Marketing.PublicPublishDir); configured != "" {
			dir = configured
		}
	}
	if filepath.IsAbs(dir) {
		if !isPathWithinDir(dir, workspace) {
			return "", false
		}
		return filepath.Clean(dir), true
	}
	return filepath.Clean(filepath.Join(workspace, dir)), true
}

func resolvePublicMarketingAsset(root, asset string) (string, bool) {
	asset = path.Clean("/" + strings.TrimSpace(asset))
	asset = strings.TrimPrefix(asset, "/")
	if asset == "" || asset == "." || strings.HasPrefix(asset, "../") {
		return "", false
	}
	candidate := filepath.Clean(filepath.Join(root, filepath.FromSlash(asset)))
	if !isPathWithinDir(candidate, root) {
		return "", false
	}
	rootReal, rootErr := filepath.EvalSymlinks(root)
	candidateReal, candidateErr := filepath.EvalSymlinks(candidate)
	if rootErr == nil && candidateErr == nil && !isPathWithinDir(candidateReal, rootReal) {
		return "", false
	}
	return candidate, true
}

func isPathWithinDir(candidate, dir string) bool {
	rel, err := filepath.Rel(filepath.Clean(dir), filepath.Clean(candidate))
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}

func allowedPublicMarketingExt(ext string) bool {
	switch strings.ToLower(strings.TrimSpace(ext)) {
	case ".html", ".htm", ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".pdf":
		return true
	default:
		return false
	}
}

func publicMarketingURLForAsset(agent config.AgentConfig, assetPath string) string {
	root, ok := marketingPublicDir(agent)
	if !ok {
		return ""
	}
	assetPath = strings.TrimSpace(assetPath)
	if assetPath == "" {
		return ""
	}
	if !filepath.IsAbs(assetPath) {
		assetPath = filepath.Join(agent.Workspace, assetPath)
	}
	rel, err := filepath.Rel(root, filepath.Clean(assetPath))
	if err != nil || rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." {
		return ""
	}
	return publicMarketingPrefix + path.Clean(filepath.ToSlash(rel))
}

func enrichMarketingProposal(agent config.AgentConfig, raw []byte) json.RawMessage {
	var proposal map[string]any
	if err := json.Unmarshal(raw, &proposal); err != nil {
		return json.RawMessage(raw)
	}
	assets, _ := proposal["asset_paths"].([]any)
	urls := make([]string, 0, len(assets))
	for _, item := range assets {
		assetPath, ok := item.(string)
		if !ok {
			continue
		}
		if publicURL := publicMarketingURLForAsset(agent, assetPath); publicURL != "" {
			urls = append(urls, publicURL)
		}
	}
	if len(urls) > 0 {
		proposal["public_urls"] = urls
	}
	data, err := json.Marshal(proposal)
	if err != nil {
		return json.RawMessage(raw)
	}
	return json.RawMessage(data)
}
