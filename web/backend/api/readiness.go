package api

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
)

// agentReadiness reports whether each canonical workspace agent has the memory
// data it needs to operate. Drives the dashboard semaforo at /readiness.
type agentReadiness struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Role     string   `json:"role"`
	Status   string   `json:"status"` // ok | partial | blocked | unknown
	Reasons  []string `json:"reasons,omitempty"`
	ReadsOK  []string `json:"reads_ok,omitempty"`
	ReadsBad []string `json:"reads_blocked,omitempty"`
}

type readinessResponse struct {
	Workspace string           `json:"workspace"`
	Agents    []agentReadiness `json:"agents"`
	Summary   readinessSummary `json:"summary"`
}

type readinessSummary struct {
	OK      int `json:"ok"`
	Partial int `json:"partial"`
	Blocked int `json:"blocked"`
}

func (h *Handler) registerReadinessRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace/readiness", h.handleReadiness)
}

func (h *Handler) handleReadiness(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	memoryDir := filepath.Join(workspace, "memory")

	checks := []readinessCheck{
		{
			ID:   "luna",
			Name: "Luna",
			Role: "Atendente principal",
			Requires: []memoryRequirement{
				{File: "empresa.md", MustHaveValues: []string{"Nome", "Horário"}},
				{File: "canais-autorizados.md", MustHaveBulletAfter: []string{"WhatsApp comercial"}},
				{File: "faq.md", AtLeastOneValidated: true},
			},
		},
		{
			ID:   "marcos",
			Name: "Marcos",
			Role: "Vendas",
			Requires: []memoryRequirement{
				{File: "empresa.md", MustHaveValues: []string{"Pode falar preço", "Faixa de preço"}},
			},
		},
		{
			ID:   "camila",
			Name: "Camila",
			Role: "Suporte",
			Requires: []memoryRequirement{
				{File: "empresa.md", MustHaveValues: []string{"Quando chamar humano"}},
			},
		},
		{
			ID:   "rafael",
			Name: "Rafael",
			Role: "Assistente interno",
			Requires: []memoryRequirement{
				{File: "canais-autorizados.md", MustHaveBulletAfter: []string{"Número do dono"}},
			},
		},
		{
			ID:   "lia",
			Name: "Lia",
			Role: "Marketing",
			Requires: []memoryRequirement{
				{File: "marca.md", MustHaveValues: []string{"Logo", "Cores principais"}},
				{File: "marketing.md", MustNotContain: []string{"[ATUALIZAR"}},
			},
		},
		{
			ID:   "sofia",
			Name: "Sofia",
			Role: "Onboarding",
			// Sofia writes, doesn't read business memory. She is always OK
			// as long as her skills directory exists.
			SkillCheck: filepath.Join(workspace, "skills", "onboarding", "cadastrar-empresa", "SKILL.md"),
		},
	}

	resp := readinessResponse{Workspace: workspace, Agents: make([]agentReadiness, 0, len(checks))}
	for _, c := range checks {
		resp.Agents = append(resp.Agents, c.evaluate(memoryDir))
	}
	for _, a := range resp.Agents {
		switch a.Status {
		case "ok":
			resp.Summary.OK++
		case "partial":
			resp.Summary.Partial++
		case "blocked":
			resp.Summary.Blocked++
		}
	}
	writeJSON(w, resp)
}

type memoryRequirement struct {
	File                string
	MustHaveValues      []string // "Field:" lines that must have non-empty value
	MustHaveBulletAfter []string // section headings that must have at least one filled bullet
	MustNotContain      []string // substrings that, if present, indicate placeholder content
	AtLeastOneValidated bool     // file must contain "Status: validada"
}

type readinessCheck struct {
	ID         string
	Name       string
	Role       string
	Requires   []memoryRequirement
	SkillCheck string
}

func (c readinessCheck) evaluate(memoryDir string) agentReadiness {
	out := agentReadiness{ID: c.ID, Name: c.Name, Role: c.Role}
	if c.SkillCheck != "" {
		if _, err := os.Stat(c.SkillCheck); err != nil {
			out.Status = "blocked"
			out.Reasons = append(
				out.Reasons,
				fmt.Sprintf("Skill ausente: %s", filepath.Base(filepath.Dir(c.SkillCheck))),
			)
			return out
		}
	}
	if len(c.Requires) == 0 {
		out.Status = "ok"
		return out
	}
	blocked := 0
	for _, req := range c.Requires {
		path := filepath.Join(memoryDir, req.File)
		raw, err := os.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				out.ReadsBad = append(out.ReadsBad, req.File)
				out.Reasons = append(out.Reasons, fmt.Sprintf("%s não existe", req.File))
				blocked++
				continue
			}
			out.ReadsBad = append(out.ReadsBad, req.File)
			out.Reasons = append(out.Reasons, fmt.Sprintf("erro lendo %s: %v", req.File, err))
			blocked++
			continue
		}
		text := string(raw)
		fileBlocked := false
		for _, field := range req.MustHaveValues {
			if !hasFilledField(text, field) {
				out.Reasons = append(out.Reasons, fmt.Sprintf("%s: campo \"%s\" vazio", req.File, field))
				fileBlocked = true
			}
		}
		for _, heading := range req.MustHaveBulletAfter {
			if !hasFilledBulletAfter(text, heading) {
				out.Reasons = append(out.Reasons, fmt.Sprintf("%s: \"%s\" sem valor", req.File, heading))
				fileBlocked = true
			}
		}
		for _, bad := range req.MustNotContain {
			if strings.Contains(text, bad) {
				out.Reasons = append(out.Reasons, fmt.Sprintf("%s: ainda contém placeholder %q", req.File, bad))
				fileBlocked = true
			}
		}
		if req.AtLeastOneValidated && !strings.Contains(strings.ToLower(text), "status: validada") {
			out.Reasons = append(out.Reasons, fmt.Sprintf("%s: nenhuma entrada validada", req.File))
			fileBlocked = true
		}
		if fileBlocked {
			out.ReadsBad = append(out.ReadsBad, req.File)
			blocked++
		} else {
			out.ReadsOK = append(out.ReadsOK, req.File)
		}
	}
	switch {
	case blocked == 0:
		out.Status = "ok"
	case blocked == len(c.Requires):
		out.Status = "blocked"
	default:
		out.Status = "partial"
	}
	return out
}

// hasFilledField returns true when the markdown contains a line like
// "Field: value" with a non-empty value (after the colon).
func hasFilledField(text, field string) bool {
	prefix := strings.ToLower(field) + ":"
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		lower := strings.ToLower(trimmed)
		if !strings.HasPrefix(lower, prefix) {
			continue
		}
		value := strings.TrimSpace(trimmed[len(prefix):])
		if value != "" {
			return true
		}
	}
	return false
}

// hasFilledBulletAfter looks for the first bullet line after a heading or
// labeled line containing `heading` and returns true if that bullet has a
// non-empty value to the right of the first colon.
func hasFilledBulletAfter(text, heading string) bool {
	lines := strings.Split(text, "\n")
	target := strings.ToLower(heading)
	for i, line := range lines {
		if !strings.Contains(strings.ToLower(line), target) {
			continue
		}
		// scan forward for first bullet
		for j := i; j < len(lines) && j < i+8; j++ {
			b := strings.TrimSpace(lines[j])
			if !strings.HasPrefix(b, "- ") {
				continue
			}
			rest := strings.TrimSpace(strings.TrimPrefix(b, "- "))
			if idx := strings.Index(rest, ":"); idx >= 0 {
				if strings.TrimSpace(rest[idx+1:]) != "" {
					return true
				}
			} else if rest != "" {
				// bullet without colon, treat presence as filled
				return true
			}
		}
		return false
	}
	return false
}
