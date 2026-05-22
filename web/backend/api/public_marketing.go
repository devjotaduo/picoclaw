package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
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
	mux.HandleFunc("GET /api/marketing/public-base-url", h.handleMarketingPublicBaseURL)
	mux.HandleFunc("PUT /api/marketing/catalog-data", h.handlePutCatalogData)
}

// handleMarketingPublicBaseURL returns the resolved public base URL and the
// workspace-relative publish directory so that Lia (or any caller) can build
// absolute asset links without hardcoding host names.
//
//	GET /api/marketing/public-base-url
//	→ {"base_url":"https://minhaclinica.jotaduo.com","publish_dir":"workspace/public/marketing","example":"https://minhaclinica.jotaduo.com/public/marketing/promo.html"}
func (h *Handler) handleMarketingPublicBaseURL(w http.ResponseWriter, r *http.Request) {
	base := resolvedPublicBaseURL()
	cfg, err := h.loadOrchestrationConfig()
	publishDir := "workspace/public/marketing"
	if err == nil {
		if agentCfg, ok := findAgentConfig(cfg, orchestrator.AgentMarketing); ok {
			if root, ok := marketingPublicDir(agentCfg); ok {
				publishDir = root
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"base_url":    base,
		"publish_dir": publishDir,
		"example":     strings.TrimRight(base, "/") + publicMarketingPrefix + "promo.html",
	})
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

// resolvedPublicBaseURL returns the base URL to use for absolute public asset
// links. It reads PICOCLAW_PUBLIC_BASE_URL (set by the SaaS controlplane to the
// tenant subdomain, e.g. "https://minhaclinica.jotaduo.com"). When the env var
// is absent it returns an empty string and callers should fall back to relative
// paths.
func resolvedPublicBaseURL() string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv(config.EnvPublicBaseURL)), "/")
}

// publicMarketingURLForAsset returns the public URL for a given asset path.
// When PICOCLAW_PUBLIC_BASE_URL is set the URL is absolute (includes the tenant
// subdomain). Otherwise it falls back to the launcher-relative path
// "/public/marketing/…" which is valid within the same origin.
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
	relPath := publicMarketingPrefix + path.Clean(filepath.ToSlash(rel))
	if base := resolvedPublicBaseURL(); base != "" {
		return base + relPath
	}
	return relPath
}

// maxCatalogDataBytes limits catalog JSON to 512 KiB.
const maxCatalogDataBytes = 512 * 1024

// handlePutCatalogData writes the interactive catalog JSON to the marketing
// publish directory so it persists server-side across devices and browsers.
// The file is served as a static asset at GET /public/marketing/catalog-data.json
// and consumed by catalogo-v2.html on load.
//
//	PUT /api/marketing/catalog-data
//	Body: {"empresa":{…},"produtos":[…]}   (application/json)
//	→ {"ok":true,"path":"…","public_url":"…"}
func (h *Handler) handlePutCatalogData(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.loadOrchestrationConfig()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	agentCfg, ok := findAgentConfig(cfg, orchestrator.AgentMarketing)
	if !ok || strings.TrimSpace(agentCfg.Workspace) == "" {
		http.Error(w, "marketing agent not configured", http.StatusNotFound)
		return
	}
	root, ok := marketingPublicDir(agentCfg)
	if !ok {
		http.Error(w, "marketing publish dir not configured", http.StatusInternalServerError)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, int64(maxCatalogDataBytes+1)))
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to read body: %v", err), http.StatusBadRequest)
		return
	}
	if len(body) > maxCatalogDataBytes {
		http.Error(w, fmt.Sprintf("catalog data exceeds %d bytes", maxCatalogDataBytes), http.StatusRequestEntityTooLarge)
		return
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if _, hasEmpresa := payload["empresa"]; !hasEmpresa {
		http.Error(w, "missing required key: empresa", http.StatusBadRequest)
		return
	}
	if _, hasProdutos := payload["produtos"]; !hasProdutos {
		http.Error(w, "missing required key: produtos", http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		http.Error(w, fmt.Sprintf("failed to create publish dir: %v", err), http.StatusInternalServerError)
		return
	}
	destPath := filepath.Join(root, "catalog-data.json")
	if !isPathWithinDir(destPath, root) {
		http.Error(w, "invalid destination path", http.StatusBadRequest)
		return
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, body, "", "  "); err != nil {
		pretty.Write(body)
	}
	if err := os.WriteFile(destPath, pretty.Bytes(), 0o644); err != nil {
		http.Error(w, fmt.Sprintf("failed to write catalog data: %v", err), http.StatusInternalServerError)
		return
	}
	publicURL := publicMarketingURLForAsset(agentCfg, destPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":         true,
		"path":       filepath.ToSlash(destPath),
		"public_url": publicURL,
	})
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
