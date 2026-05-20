package tenant

// Translate the Clara onboarding intake into Markdown files that live inside
// the new tenant's workspace/memory and workspace/config. Without this step,
// the visitor would re-type everything Clara already collected: name, segment,
// channels, pain, Instagram, etc. With it, the new tenant boots with the
// company memory pre-populated; Sofia's heartbeat then picks up the rows
// flagged "Status: pendente de validação" and confirms them with the owner
// on the first WhatsApp turn.
//
// Design notes:
//   - Writes are deliberately structured Markdown that matches the existing
//     template format (memory/empresa.md, memory/leads.md, etc), so Sofia
//     can read them with the same skills she'd use on any other tenant data.
//   - Every field carries a "Status: pendente de validação" marker so the
//     proactive scan in HEARTBEAT.md item 9 ("informações faltando na
//     memória") fires. When the owner confirms, Sofia rewrites Status to
//     "validada".
//   - Idempotent: if a memory file already exists (e.g. operator manually
//     pre-filled, or a re-provision retry), we leave it alone.
//   - No-op when intake is nil or the workspace dir is missing.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/clara"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// SeedTenantFromIntake writes Clara's intake answers into the tenant's
// workspace/memory and workspace/config files. Each file is created only
// when it doesn't already exist on disk — fresh tenants get all seven,
// existing tenants keep whatever they have.
//
// volumePath is the tenant volume root (where workspace/ lives). intake is
// the controlplane row Clara built up turn-by-turn.
func SeedTenantFromIntake(volumePath string, intake *store.CompanyIntake) error {
	if intake == nil || volumePath == "" {
		return nil
	}
	wsDir := filepath.Join(volumePath, "workspace")
	if _, err := os.Stat(wsDir); err != nil {
		// Workspace dir doesn't exist yet; either the profile didn't seed it
		// or the volume is broken. Either way, nothing to do here.
		return nil
	}
	answers, err := clara.ParseAnswers(intake.AnswersJSON)
	if err != nil {
		return fmt.Errorf("parse intake answers: %w", err)
	}
	if answers == nil {
		answers = &clara.Answers{}
	}

	writes := []struct {
		path    string
		content string
	}{
		{filepath.Join(wsDir, "memory", "empresa.md"), renderEmpresaMemory(intake, answers)},
		{filepath.Join(wsDir, "memory", "leads.md"), renderOwnerLead(intake, answers)},
		{filepath.Join(wsDir, "memory", "canais-autorizados.md"), renderAuthorizedChannels(intake)},
		{filepath.Join(wsDir, "memory", "atendimentos.md"), renderFirstAtendimento(intake, answers)},
		{filepath.Join(wsDir, "config", "company-profile.md"), renderCompanyProfileConfig(intake, answers)},
	}

	for _, w := range writes {
		if err := writeIfMissing(w.path, w.content); err != nil {
			return fmt.Errorf("write %s: %w", filepath.Base(w.path), err)
		}
	}
	return nil
}

// writeIfMissing skips when the file already exists. We never want to clobber
// data the tenant or operator may have edited between provisioning attempts.
func writeIfMissing(path, content string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func renderEmpresaMemory(intake *store.CompanyIntake, a *clara.Answers) string {
	now := time.Now().UTC().Format("2026-01-02")
	var b strings.Builder
	b.WriteString("# Memória da empresa\n\n")
	b.WriteString(fmt.Sprintf("Nome: %s\n", fallback(intake.CompanyName, "")))
	b.WriteString(fmt.Sprintf("Segmento: %s\n", joinList(a.Segments)))
	b.WriteString(fmt.Sprintf("Descrição: %s\n", a.Offer))
	b.WriteString(fmt.Sprintf("Produtos ou serviços: %s\n", joinList(append([]string{a.ProductType}, a.Pains...))))
	b.WriteString("Horário:\n")
	b.WriteString("Endereço:\n")
	b.WriteString("Regiões atendidas:\n")
	b.WriteString(fmt.Sprintf("WhatsApp: %s\n", intake.ContactWhatsApp))
	b.WriteString(fmt.Sprintf("Instagram: %s\n", a.Instagram))
	b.WriteString(fmt.Sprintf("Site: %s\n", a.Website))
	b.WriteString("Formas de pagamento:\n")
	b.WriteString("Pode falar preço:\n")
	b.WriteString("Faixa de preço:\n")
	b.WriteString("Quando chamar humano:\n")
	b.WriteString("Informações que nunca podem ser inventadas:\n")
	b.WriteString("Informações proibidas de falar:\n")
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("Origem: pré-cadastro Clara em %s\n", now))
	b.WriteString("Status da informação: pendente de validação\n")
	if a.PriorityAgent != "" {
		b.WriteString("\n## Foco prioritário identificado pela Clara\n")
		b.WriteString(fmt.Sprintf("- Agente prioritário: %s\n", a.PriorityAgent))
		if a.PriorityReason != "" {
			b.WriteString(fmt.Sprintf("- Motivo: %s\n", a.PriorityReason))
		}
	}
	if a.ProblemArea != "" {
		b.WriteString("\n## Dor estruturada\n")
		b.WriteString(fmt.Sprintf("- Área: %s\n", a.ProblemArea))
		if a.ProblemAreaNote != "" {
			b.WriteString(fmt.Sprintf("- Detalhe: %s\n", a.ProblemAreaNote))
		}
	}
	if a.CRMName != "" {
		b.WriteString("\n## Sistema atual\n")
		b.WriteString(fmt.Sprintf("- CRM/ferramenta: %s\n", a.CRMName))
		if a.CRMNotes != "" {
			b.WriteString(fmt.Sprintf("- Observação: %s\n", a.CRMNotes))
		}
	}
	if a.QuotingPersonalized != nil {
		b.WriteString("\n## Orçamento\n")
		if *a.QuotingPersonalized {
			b.WriteString("- Cada cliente é um caso (orçamento personalizado).\n")
		} else {
			b.WriteString("- Tabela fixa de preço.\n")
		}
		if a.QuotingNotes != "" {
			b.WriteString(fmt.Sprintf("- Observação: %s\n", a.QuotingNotes))
		}
	}
	return b.String()
}

func renderOwnerLead(intake *store.CompanyIntake, a *clara.Answers) string {
	now := time.Now().UTC().Format("2026-01-02")
	var b strings.Builder
	b.WriteString("# Leads\n\n")
	b.WriteString("## Modelo de registro\n\n")
	b.WriteString("Nome:\nEmpresa:\nContato:\nOrigem:\nNecessidade:\nUrgência:\nOrçamento:\nProduto ou serviço de interesse:\nClassificação: frio, morno ou quente\nEtapa do funil:\nAgente responsável:\nPróximo passo:\nData do último contato:\nStatus:\n\n")
	b.WriteString("---\n\n")
	b.WriteString("## Lead 1 — dono do tenant (pré-cadastro Clara)\n\n")
	b.WriteString(fmt.Sprintf("Nome: %s\n", fallback(intake.ContactName, "")))
	b.WriteString(fmt.Sprintf("Empresa: %s\n", fallback(intake.CompanyName, "")))
	b.WriteString(fmt.Sprintf("Contato: %s — %s\n", intake.ContactEmail, intake.ContactWhatsApp))
	b.WriteString("Origem: pré-cadastro Clara (jotaduo.com)\n")
	b.WriteString(fmt.Sprintf("Necessidade: %s\n", joinList(a.Pains)))
	b.WriteString("Urgência: pendente de validação\n")
	b.WriteString("Orçamento: pendente de validação\n")
	b.WriteString(fmt.Sprintf("Produto ou serviço de interesse: %s\n", a.Offer))
	b.WriteString("Classificação: quente (qualificou no pré-cadastro)\n")
	b.WriteString("Etapa do funil: onboarding\n")
	b.WriteString("Agente responsável: Sofia\n")
	b.WriteString("Próximo passo: Sofia receber o dono no painel (onboarding por segmento), validar memória e passar pra Rafael acompanhar\n")
	b.WriteString(fmt.Sprintf("Data do último contato: %s\n", now))
	b.WriteString("Status: pendente de validação\n")
	return b.String()
}

func renderAuthorizedChannels(intake *store.CompanyIntake) string {
	var b strings.Builder
	b.WriteString("# Canais autorizados\n\n")
	b.WriteString("## Rafael\n")
	b.WriteString("Pode atuar apenas em:\n")
	if intake.ContactWhatsApp != "" {
		b.WriteString(fmt.Sprintf("- Número do dono: %s\n", intake.ContactWhatsApp))
	} else {
		b.WriteString("- Número do dono: pendente de validação\n")
	}
	b.WriteString("- Número do gerente:\n")
	b.WriteString("- Grupo interno da empresa:\n\n")
	b.WriteString("Não pode responder cliente final sem autorização.\n\n")
	b.WriteString("## Clara\n")
	b.WriteString("Pode atuar em:\n")
	b.WriteString("- Grupo de atendimento:\n")
	b.WriteString("- WhatsApp comercial:\n")
	b.WriteString("- Canal do site:\n\n")
	b.WriteString("## Marcos\n")
	b.WriteString("Pode ser chamado por:\n- Rafael\n- Clara\n- Atendimento Humano\n\n")
	b.WriteString("## Camila\n")
	b.WriteString("Pode ser chamada por:\n- Rafael\n- Clara\n- Atendimento Humano\n\n")
	b.WriteString("## Lia\n")
	b.WriteString("Atua via cron, painel interno ou chamada de Rafael. Não fala com cliente final.\n\n")
	b.WriteString("Status: pendente de validação (Sofia faz o onboarding no painel; Rafael confirma com o dono quais números/grupos são internos vs públicos; o WhatsApp comercial entra aqui depois que o dono parear o número em Canais → WhatsApp)\n")
	return b.String()
}

func renderFirstAtendimento(intake *store.CompanyIntake, a *clara.Answers) string {
	now := time.Now().UTC().Format("2026-01-02 15:04 UTC")
	var b strings.Builder
	b.WriteString("# Atendimentos\n\n")
	b.WriteString("## Modelo de registro\n\n")
	b.WriteString("Data:\nCliente:\nContato:\nCanal:\nResumo:\nAgente:\nResultado:\nPróximo passo:\n\n")
	b.WriteString("---\n\n")
	b.WriteString("## Atendimento 1 — pré-cadastro Clara\n\n")
	b.WriteString(fmt.Sprintf("Data: %s\n", now))
	b.WriteString(fmt.Sprintf("Cliente: %s (%s)\n", fallback(intake.ContactName, ""), fallback(intake.CompanyName, "")))
	b.WriteString(fmt.Sprintf("Contato: %s — %s\n", intake.ContactEmail, intake.ContactWhatsApp))
	b.WriteString("Canal: web (jotaduo.com pré-cadastro)\n")
	b.WriteString("Resumo: Clara qualificou o lead em conversa pública.\n")
	if a.PriorityAgent != "" {
		b.WriteString(fmt.Sprintf("- Foco prioritário: %s\n", a.PriorityAgent))
	}
	if a.ProblemArea != "" {
		b.WriteString(fmt.Sprintf("- Área de dor: %s\n", a.ProblemArea))
	}
	if len(a.Pains) > 0 {
		b.WriteString(fmt.Sprintf("- Dor relatada: %s\n", joinList(a.Pains)))
	}
	b.WriteString("Agente: Clara (pré-cadastro) → Sofia (onboarding)\n")
	b.WriteString("Resultado: qualificado, tenant provisionado.\n")
	b.WriteString("Próximo passo: Sofia conduzir onboarding no painel (canal pico) com o dono, disparar playbook por segmento (saude/alimentacao/varejo/beleza/imobiliaria/servicos/educacao/default), validar memória e marcar campos como validados. WhatsApp da empresa ainda não está pareado nesse momento — conectar é uma etapa posterior, em Canais. Depois Rafael assume o acompanhamento operacional.\n")
	return b.String()
}

func renderCompanyProfileConfig(intake *store.CompanyIntake, a *clara.Answers) string {
	var b strings.Builder
	b.WriteString("# Perfil da empresa\n\n")
	b.WriteString(fmt.Sprintf("Nome da empresa: %s\n", fallback(intake.CompanyName, "")))
	b.WriteString(fmt.Sprintf("Segmento: %s\n", joinList(a.Segments)))
	b.WriteString(fmt.Sprintf("Descrição curta: %s\n", a.Offer))
	b.WriteString(fmt.Sprintf("Produtos ou serviços: %s\n", a.ProductType))
	b.WriteString("Horário de funcionamento:\n")
	b.WriteString("Endereço:\n")
	b.WriteString("Regiões atendidas:\n")
	b.WriteString(fmt.Sprintf("WhatsApp: %s\n", intake.ContactWhatsApp))
	b.WriteString(fmt.Sprintf("Instagram: %s\n", a.Instagram))
	b.WriteString(fmt.Sprintf("Site: %s\n", a.Website))
	b.WriteString("Formas de pagamento:\n")
	b.WriteString("Pode informar preço:\n")
	b.WriteString("Faixa de preço:\n")
	b.WriteString("Quando chamar humano:\n")
	b.WriteString("Perguntas frequentes:\n")
	b.WriteString("Objeções comuns:\n")
	b.WriteString("Informações que o agente nunca pode errar:\n")
	b.WriteString("Informações proibidas de falar:\n")
	b.WriteString(fmt.Sprintf("Responsável humano: %s (%s)\n", fallback(intake.ContactName, ""), intake.ContactEmail))
	b.WriteString("\nObservações internas:\n")
	b.WriteString("Este perfil foi pré-preenchido pelo pré-cadastro Clara.\n")
	b.WriteString("Sofia faz o onboarding no painel: identifica o segmento, dispara o playbook adequado e preenche os campos vazios com o dono. Só depois Clara/Marcos/Camila/Lia usam como fonte oficial. WhatsApp comercial é pareado depois pelo dono em Canais → WhatsApp.\n")
	return b.String()
}

func fallback(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func joinList(items []string) string {
	out := make([]string, 0, len(items))
	for _, s := range items {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return strings.Join(out, ", ")
}
