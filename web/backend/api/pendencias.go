package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

type pendenciaItem struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Heading string `json:"heading,omitempty"`
	Text    string `json:"text"`
}

type pendenciasResponse struct {
	Workspace string          `json:"workspace"`
	Items     []pendenciaItem `json:"items"`
	TotalByID map[string]int  `json:"total_by_file"`
}

func (h *Handler) registerPendenciasRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/pendencias", h.handleListPendencias)
}

// pendenciaMarker matches lines that signal an open follow-up an agent or human
// must complete. We look for the literal "PENDENCIAS" keyword (with or without
// accent and trailing punctuation) at the start of the trimmed line, plus a
// looser bullet variant that some agents emit ("- [ ] ..." style).
var pendenciaMarker = regexp.MustCompile(`(?i)^(pend(e|ê)ncias?)[\s:\-]*`)

// bulletMarker matches Markdown bullet lines we treat as individual items
// inside a "PENDENCIAS:" block until we hit a blank line or a new heading.
var bulletMarker = regexp.MustCompile(`^\s*([-*+]|\d+\.)\s+(.*\S.*)$`)

// headingMarker recognises ATX headings (# ... ######) so we can stop
// collecting bullets at section boundaries.
var headingMarker = regexp.MustCompile(`^\s{0,3}#{1,6}\s+\S`)

func (h *Handler) handleListPendencias(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	items, err := scanPendencias(filepath.Join(workspace, "memory"))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to scan pendencias: %v", err), http.StatusInternalServerError)
		return
	}
	totals := map[string]int{}
	for _, it := range items {
		totals[it.File]++
	}
	writeJSON(w, pendenciasResponse{
		Workspace: workspace,
		Items:     items,
		TotalByID: totals,
	})
}

func scanPendencias(memoryDir string) ([]pendenciaItem, error) {
	entries, err := os.ReadDir(memoryDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []pendenciaItem{}, nil
		}
		return nil, err
	}
	var items []pendenciaItem
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(memoryDir, entry.Name()))
		if err != nil {
			continue
		}
		items = append(items, extractPendencias(entry.Name(), string(raw))...)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].File != items[j].File {
			return items[i].File < items[j].File
		}
		return items[i].Line < items[j].Line
	})
	if items == nil {
		items = []pendenciaItem{}
	}
	return items, nil
}

func extractPendencias(file, content string) []pendenciaItem {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	var (
		out         []pendenciaItem
		inBlock     bool
		currentHead string
	)
	for i, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if headingMarker.MatchString(raw) {
			currentHead = strings.TrimLeft(strings.TrimSpace(raw), "#")
			currentHead = strings.TrimSpace(currentHead)
			// Se o heading começa com "Pendências/PENDENCIAS", entra no
			// bloco de captura — bullets seguintes serão coletados como
			// items. Padrão atual das memórias é usar headings (## ou ###)
			// pra abrir seções de pendência; sem isso o scan ignorava tudo.
			if pendenciaMarker.MatchString(currentHead) {
				inBlock = true
			} else {
				inBlock = false
			}
			continue
		}
		if loc := pendenciaMarker.FindStringIndex(trimmed); loc != nil {
			inBlock = true
			tail := strings.TrimSpace(trimmed[loc[1]:])
			if tail != "" {
				out = append(out, pendenciaItem{
					File:    file,
					Line:    i + 1,
					Heading: currentHead,
					Text:    tail,
				})
			}
			continue
		}
		if inBlock {
			if trimmed == "" {
				inBlock = false
				continue
			}
			if m := bulletMarker.FindStringSubmatch(raw); m != nil {
				out = append(out, pendenciaItem{
					File:    file,
					Line:    i + 1,
					Heading: currentHead,
					Text:    strings.TrimSpace(m[2]),
				})
				continue
			}
			// Plain prose continuation lines are kept as single items so the
			// dashboard surfaces context the agent wrote inline.
			out = append(out, pendenciaItem{
				File:    file,
				Line:    i + 1,
				Heading: currentHead,
				Text:    trimmed,
			})
		}
	}
	return out
}
