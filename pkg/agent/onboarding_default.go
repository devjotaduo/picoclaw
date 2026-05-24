package agent

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/sipeed/picoclaw/pkg/logger"
)

// onboardingAgentID é o ID do agente que assume como default enquanto o
// onboarding da empresa não está completo. Hardcoded por agora; se um dia
// houver necessidade de customizar (ex: outro nome de agente por tenant),
// virar config.
const onboardingAgentID = "sofia"

// onboardingCacheTTL evita ler memory/empresa.md a cada GetDefaultAgent.
// A cache é revalidada quando o mtime do arquivo muda OU quando o TTL
// expira (o que vier primeiro).
const onboardingCacheTTL = 30 * time.Second

// onboardingDetector descobre se o tenant ainda está em onboarding (i.e.,
// o dono ainda não completou memory/empresa.md). Quando True, o registry
// redireciona o default agent para Sofia.
type onboardingDetector struct {
	mu         sync.Mutex
	workspace  string
	incomplete bool
	lastMtime  time.Time
	lastCheck  time.Time
	logged     bool // log da troca acontece 1x por mudança de estado
}

func newOnboardingDetector(workspace string) *onboardingDetector {
	return &onboardingDetector{workspace: workspace}
}

// IsIncomplete retorna true se a empresa do tenant não foi cadastrada
// (memory/empresa.md ainda no estado de template/placeholder). Thread-safe
// e cacheado por 30s + mtime.
func (d *onboardingDetector) IsIncomplete() bool {
	if d == nil || d.workspace == "" {
		return false
	}
	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()
	path := filepath.Join(d.workspace, "memory", "empresa.md")
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Sem arquivo = sem cadastro. Sofia assume.
			if !d.incomplete && !d.logged {
				logger.InfoCF("agent", "Onboarding: memory/empresa.md ausente, Sofia ativa como default agent", nil)
				d.logged = true
			}
			d.incomplete = true
			d.lastCheck = now
			return true
		}
		// Stat falhou por outro motivo (permissão, etc) — preserva último valor
		// conhecido pra não oscilar.
		return d.incomplete
	}

	// Cache hit: TTL não estourou E mtime não mudou
	if now.Sub(d.lastCheck) < onboardingCacheTTL && info.ModTime().Equal(d.lastMtime) {
		return d.incomplete
	}

	// Cache miss: lê e analisa
	data, err := os.ReadFile(path)
	if err != nil {
		return d.incomplete
	}

	wasIncomplete := d.incomplete
	d.incomplete = checkOnboardingIncomplete(string(data))
	d.lastMtime = info.ModTime()
	d.lastCheck = now

	// Log transitions (1x por flip)
	if wasIncomplete != d.incomplete || !d.logged {
		if d.incomplete {
			logger.InfoCF("agent", "Onboarding incompleto detectado, Sofia ativa como default agent", map[string]any{
				"workspace": d.workspace,
			})
		} else {
			logger.InfoCF("agent", "Onboarding concluído, default agent volta ao configurado", map[string]any{
				"workspace": d.workspace,
			})
		}
		d.logged = true
	}

	return d.incomplete
}

// reEmptyNome / reEmptySegmento — regex pré-compiladas para o caso mais
// comum: linha "Nome:" ou "Segmento:" sem valor (só whitespace ou nada).
var (
	reEmptyNome     = regexp.MustCompile(`(?m)^Nome:\s*$`)
	reEmptySegmento = regexp.MustCompile(`(?m)^Segmento:\s*$`)
)

// checkOnboardingIncomplete inspeciona o conteúdo de memory/empresa.md e
// devolve true se a empresa ainda não foi cadastrada. Critérios (qualquer
// um basta):
//
//  1. Marcador explícito "Status: pendente de validação" presente
//  2. Campo Nome: vazio (linha "Nome:" sem valor)
//  3. Campo Segmento: vazio
//
// Esses 3 são marcadores fortes do template original (workspace/memory/
// empresa.md no estado inicial). Quando o dono preenche pelo menos Nome e
// Segmento + remove o "Status: pendente", o onboarding é considerado feito
// e o default agent volta pro normal.
func checkOnboardingIncomplete(content string) bool {
	if strings.Contains(content, "Status: pendente de validação") {
		return true
	}
	if reEmptyNome.MatchString(content) {
		return true
	}
	if reEmptySegmento.MatchString(content) {
		return true
	}
	return false
}
