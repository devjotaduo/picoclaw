package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
	buildconfig "github.com/sipeed/picoclaw/pkg/config"
)

const (
	workspaceSyncStatusSynced   = "synced"
	workspaceSyncStatusDiverged = "diverged"
	workspaceSyncStatusUnknown  = "unknown"
)

var (
	workspaceFingerprintExcludeNames = map[string]struct{}{
		"sessions":                    {},
		"whatsapp":                    {},
		"state":                       {},
		"output":                      {},
		"logs":                        {},
		"cache":                       {},
		".cache":                      {},
		"node_modules":                {},
		".pnpm-store":                 {},
		"auth.json":                   {},
		"heartbeat.log":               {},
		"gerar_pdf_mamiferos.py":      {},
		"mamiferos_apresentacao.html": {},
		"RELATORIO-MELHORIAS.md":      {},
		".git":                        {},
		".vscode":                     {},
		".idea":                       {},
		"__pycache__":                 {},
	}
	workspaceFingerprintExcludeSuffixes = []string{".log", ".tmp.json", ".pid", ".sock", ".pyc"}
	workspaceSecurityTokenPattern       = regexp.MustCompile(`(?m)^(\s*-\s*)([A-Za-z][A-Za-z0-9_\-]{29,})\s*$`)
)

type workspaceContentFingerprint struct {
	HashSHA256 string
	FileCount  int
}

type workspaceBaselineManifest struct {
	HashSHA256 string
	FileCount  int
}

type workspaceSyncStatusResponse struct {
	WorkspaceID           string    `json:"workspace_id"`
	WorkspaceSlug         string    `json:"workspace_slug"`
	AdminHashSHA256       string    `json:"admin_hash_sha256"`
	AdminFileCount        int       `json:"admin_file_count"`
	DeployedGitHashSHA256 string    `json:"deployed_git_hash_sha256"`
	DeployedFileCount     int       `json:"deployed_file_count"`
	DeployedGitCommit     string    `json:"deployed_git_commit"`
	Status                string    `json:"status"`
	CheckedAt             time.Time `json:"checked_at"`
}

func (h *Handler) handleGetWorkspaceSyncStatus(w http.ResponseWriter, r *http.Request) {
	ws, ok := h.getWorkspace(w, r)
	if !ok {
		return
	}

	resp := workspaceSyncStatusForWorkspace(ws, time.Now().UTC())
	writeJSON(w, http.StatusOK, resp)
}

func workspaceSyncStatusForWorkspace(ws *store.Workspace, checkedAt time.Time) workspaceSyncStatusResponse {
	resp := workspaceSyncStatusResponse{
		WorkspaceID:       ws.ID,
		WorkspaceSlug:     ws.Slug,
		DeployedGitCommit: buildconfig.GitCommit,
		Status:            workspaceSyncStatusUnknown,
		CheckedAt:         checkedAt,
	}

	if _, ok := readEmbeddedBaselineManifest(); ok {
		if fp, err := fingerprintEmbeddedBaseline(); err == nil {
			resp.DeployedGitHashSHA256 = fp.HashSHA256
			resp.DeployedFileCount = fp.FileCount
		}
	}

	homeDir := filepath.Join(ws.HostPath, tenant.WorkspaceHomeSubdir)
	if fp, err := fingerprintWorkspaceHomeDir(homeDir); err == nil {
		resp.AdminHashSHA256 = fp.HashSHA256
		resp.AdminFileCount = fp.FileCount
	}

	if resp.AdminHashSHA256 == "" || resp.DeployedGitHashSHA256 == "" {
		return resp
	}
	if resp.AdminHashSHA256 == resp.DeployedGitHashSHA256 {
		resp.Status = workspaceSyncStatusSynced
	} else {
		resp.Status = workspaceSyncStatusDiverged
	}
	return resp
}

func readEmbeddedBaselineManifest() (workspaceBaselineManifest, bool) {
	data, err := baselineWorkspaceFS.ReadFile("baseline-workspace/SYNCED_FROM")
	if err != nil {
		return workspaceBaselineManifest{}, false
	}
	var out workspaceBaselineManifest
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "content_hash_sha256:") {
			out.HashSHA256 = strings.TrimSpace(strings.TrimPrefix(line, "content_hash_sha256:"))
			continue
		}
		if strings.HasPrefix(line, "file_count:") {
			n, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "file_count:")))
			if err == nil {
				out.FileCount = n
			}
		}
	}
	if out.HashSHA256 == "" {
		return workspaceBaselineManifest{}, false
	}
	return out, true
}

func fingerprintEmbeddedBaseline() (workspaceContentFingerprint, error) {
	const embedRoot = "baseline-workspace"
	entries := map[string][]byte{}
	if err := fs.WalkDir(baselineWorkspaceFS, embedRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == embedRoot || d.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(path, embedRoot+"/")
		if rel == "SYNCED_FROM" {
			return nil
		}
		data, err := baselineWorkspaceFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read embedded baseline %s: %w", rel, err)
		}
		entries[rel] = data
		return nil
	}); err != nil {
		return workspaceContentFingerprint{}, err
	}
	return hashWorkspaceFingerprintEntries(entries), nil
}

func fingerprintWorkspaceHomeDir(homeDir string) (workspaceContentFingerprint, error) {
	entries := map[string][]byte{}
	if err := filepath.WalkDir(homeDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == homeDir {
			return nil
		}
		name := d.Name()
		if shouldSkipWorkspaceFingerprintName(name) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(homeDir, path)
		if err != nil {
			return err
		}
		baselineRel, ok := homeRelToBaselineRel(rel)
		if !ok || shouldSkipWorkspaceFingerprintRel(baselineRel) {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		entries[baselineRel] = data
		return nil
	}); err != nil {
		return workspaceContentFingerprint{}, err
	}
	if err := overlayEmbeddedBaselineSkippedFiles(entries); err != nil {
		return workspaceContentFingerprint{}, err
	}
	return hashWorkspaceFingerprintEntries(entries), nil
}

func homeRelToBaselineRel(rel string) (string, bool) {
	rel = filepath.ToSlash(filepath.Clean(rel))
	if rel == "." || rel == "" || rel == "SYNCED_FROM" {
		return "", false
	}
	if strings.HasPrefix(rel, tenant.WorkspaceHomeSubdir+"/") {
		rel = strings.TrimPrefix(rel, tenant.WorkspaceHomeSubdir+"/")
	}
	if strings.HasPrefix(rel, "workspace/") {
		return strings.TrimPrefix(rel, "workspace/"), true
	}
	if strings.Contains(rel, "/") {
		return "", false
	}
	if _, ok := embeddedBaselineHomeRootFiles[rel]; ok {
		return rel, true
	}
	return "", false
}

func overlayEmbeddedBaselineSkippedFiles(entries map[string][]byte) error {
	const embedRoot = "baseline-workspace"
	return fs.WalkDir(baselineWorkspaceFS, embedRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == embedRoot || d.IsDir() {
			return nil
		}
		rel := strings.TrimPrefix(path, embedRoot+"/")
		if rel == "SYNCED_FROM" {
			return nil
		}
		base := filepath.Base(rel)
		if base != "README.md" && base != ".gitkeep" {
			return nil
		}
		data, err := baselineWorkspaceFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read embedded baseline overlay %s: %w", rel, err)
		}
		if _, exists := entries[rel]; !exists {
			entries[rel] = data
		}
		return nil
	})
}

func fingerprintWorkspaceSourceDir(workspaceDir string) (workspaceContentFingerprint, error) {
	entries := map[string][]byte{}
	if err := filepath.WalkDir(workspaceDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == workspaceDir {
			return nil
		}
		name := d.Name()
		if shouldSkipWorkspaceFingerprintName(name) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(workspaceDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(filepath.Clean(rel))
		if rel == "." || rel == "SYNCED_FROM" || shouldSkipWorkspaceFingerprintRel(rel) {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		entries[rel] = normalizeWorkspaceSourceEntry(rel, data)
		return nil
	}); err != nil {
		return workspaceContentFingerprint{}, err
	}
	if err := overlayEmbeddedBaselineRootReadme(entries); err != nil {
		return workspaceContentFingerprint{}, err
	}
	return hashWorkspaceFingerprintEntries(entries), nil
}

func overlayEmbeddedBaselineRootReadme(entries map[string][]byte) error {
	data, err := baselineWorkspaceFS.ReadFile("baseline-workspace/README.md")
	if err != nil {
		return nil
	}
	entries["README.md"] = data
	return nil
}

func normalizeWorkspaceSourceEntry(rel string, data []byte) []byte {
	if strings.HasPrefix(rel, "memory/") && filepath.Base(rel) != ".gitkeep" {
		return workspaceMemoryStub(rel)
	}
	switch rel {
	case "config.json":
		return normalizeWorkspaceConfigJSONBytes(data)
	case ".security.yml":
		return workspaceSecurityTokenPattern.ReplaceAll(data, []byte("${1}REDACTED  # operator must replace with real key post-deploy"))
	default:
		return data
	}
}

func workspaceMemoryStub(rel string) []byte {
	ext := strings.ToLower(filepath.Ext(rel))
	switch ext {
	case ".md":
		stem := strings.TrimSuffix(filepath.Base(rel), filepath.Ext(rel))
		return []byte("# " + titleFromSlug(stem) + "\n\n")
	case ".json":
		return []byte("{}\n")
	default:
		return []byte{}
	}
}

func titleFromSlug(s string) string {
	parts := strings.Fields(strings.NewReplacer("-", " ", "_", " ").Replace(s))
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
	}
	return strings.Join(parts, " ")
}

func normalizeWorkspaceConfigJSONBytes(data []byte) []byte {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return data
	}
	changed := false
	if agents, ok := raw["agents"].(map[string]any); ok {
		if defaults, ok := agents["defaults"].(map[string]any); ok {
			if _, has := defaults["workspace"]; has && defaults["workspace"] != "/root/.picoclaw/workspace" {
				defaults["workspace"] = "/root/.picoclaw/workspace"
				changed = true
			}
		}
		if list, ok := agents["list"].([]any); ok {
			for _, item := range list {
				agent, ok := item.(map[string]any)
				if !ok {
					continue
				}
				ws, ok := agent["workspace"].(string)
				if !ok {
					continue
				}
				if strings.HasPrefix(ws, "C:") || strings.HasPrefix(ws, "/Users") || strings.HasPrefix(ws, "/home/") {
					agent["workspace"] = "/root/.picoclaw/workspace"
					changed = true
				}
			}
		}
	}
	if list, ok := raw["model_list"].([]any); ok {
		for _, item := range list {
			model, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if _, has := model["api_keys"]; has {
				model["api_keys"] = []any{"${LITELLM_KEY}"}
				changed = true
			}
			if _, has := model["api_key"]; has {
				delete(model, "api_key")
				model["api_keys"] = []any{"${LITELLM_KEY}"}
				changed = true
			}
		}
	}
	if !changed {
		return data
	}
	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return data
	}
	return append(out, '\n')
}

func hashWorkspaceFingerprintEntries(entries map[string][]byte) workspaceContentFingerprint {
	rels := make([]string, 0, len(entries))
	for rel := range entries {
		rel = filepath.ToSlash(filepath.Clean(rel))
		if rel == "." || rel == "SYNCED_FROM" {
			continue
		}
		rels = append(rels, rel)
	}
	sort.Strings(rels)

	h := sha256.New()
	count := 0
	for _, rel := range rels {
		data := entries[rel]
		h.Write([]byte(rel))
		h.Write([]byte{0})
		h.Write([]byte(strconv.Itoa(len(data))))
		h.Write([]byte{0})
		h.Write(data)
		h.Write([]byte{0})
		if rel != "README.md" {
			count++
		}
	}
	return workspaceContentFingerprint{
		HashSHA256: hex.EncodeToString(h.Sum(nil)),
		FileCount:  count,
	}
}

func shouldSkipWorkspaceFingerprintRel(rel string) bool {
	rel = filepath.ToSlash(filepath.Clean(rel))
	for _, part := range strings.Split(rel, "/") {
		if shouldSkipWorkspaceFingerprintName(part) {
			return true
		}
	}
	return false
}

func shouldSkipWorkspaceFingerprintName(name string) bool {
	if _, ok := workspaceFingerprintExcludeNames[name]; ok {
		return true
	}
	for _, suffix := range workspaceFingerprintExcludeSuffixes {
		if strings.HasSuffix(name, suffix) {
			return true
		}
	}
	return false
}
