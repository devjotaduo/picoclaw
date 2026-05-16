package gateway

import (
	"strings"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/cron"
	"github.com/sipeed/picoclaw/pkg/logger"
	"github.com/sipeed/picoclaw/pkg/routing"
)

func ensureMarketingCronJobs(service *cron.CronService, cfg *config.Config) {
	if service == nil || cfg == nil || !cfg.Tools.Cron.Enabled {
		return
	}
	hasMarketing := false
	for _, agent := range cfg.Agents.List {
		if routing.NormalizeAgentID(agent.ID) == orchestrator.AgentMarketing {
			hasMarketing = true
			break
		}
	}
	if !hasMarketing {
		return
	}
	existing := map[string]struct{}{}
	for _, job := range service.ListJobs(true) {
		existing[strings.TrimSpace(job.Name)] = struct{}{}
	}
	add := func(name, expr, message string) {
		if _, ok := existing[name]; ok {
			return
		}
		if _, err := service.AddAgentJob(name, cron.CronSchedule{Kind: "cron", Expr: expr}, message, "cron", name, orchestrator.AgentMarketing); err != nil {
			logger.WarnCF("cron", "Failed to add marketing default job", map[string]any{"name": name, "error": err.Error()})
		}
	}
	add("marketing-weekly-proposals", "0 9 * * 1", "Gere tendencias da semana, ideias de posts e uma campanha semanal. Salve o resultado como proposta de marketing.")
	add("marketing-monthly-positioning", "0 9 1 * *", "Gere um relatorio mensal de posicionamento da marca com sugestoes de melhoria. Salve o resultado como proposta de marketing.")
}
