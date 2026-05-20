package api

// Email copy for the three-step onboarding nudge sequence. Kept inline as
// Go templates so we can iterate on tone without a DB migration. The voice
// follows the Clara prompt — Brazilian Portuguese, casual but professional,
// no emoji, no tech jargon, no mention of "AI/IA/sistema/plataforma" — the
// agents are people on the Jotaduo team.

import (
	"fmt"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// reminderRender builds the (subject, html, text) tuple for one reminder.
// Returns empty strings + error if the template is unknown.
type reminderContext struct {
	OwnerName     string
	CompanyName   string
	TenantURL     string
	ResendLinkURL string // POST endpoint the visitor can hit to get a fresh magic link
	SupportEmail  string
}

func reminderRender(template store.ReminderTemplate, ctx reminderContext) (subject, html, text string, err error) {
	switch template {
	case store.ReminderTemplateFirst:
		return renderFirstReminder(ctx)
	case store.ReminderTemplateSecond:
		return renderSecondReminder(ctx)
	case store.ReminderTemplateLast:
		return renderLastReminder(ctx)
	default:
		return "", "", "", fmt.Errorf("unknown reminder template %q", template)
	}
}

func renderFirstReminder(ctx reminderContext) (string, string, string, error) {
	name := firstName(ctx.OwnerName)
	subject := "Seu painel da Jotaduo te espera"
	text := fmt.Sprintf(`Oi%s,

Faz um dia que a Clara te passou seu painel da %s e parece que você ainda não conseguiu entrar.

O link de acesso tá aqui: %s

Quando entrar, a Sofia já te recebe lá pra fechar os detalhes da empresa em uns 5 minutos — horário, regra de preço, FAQs, essas coisinhas. Daí em diante a equipe (Clara, Marcos, Camila, Lia e Rafael) começa a trabalhar pra você.

Se o link tiver expirado, é só responder esse email que a gente te manda outro.

Até já,
Jotaduo
`, prefixName(name), ctx.CompanyName, ctx.TenantURL)

	html := fmt.Sprintf(`<p>Oi%s,</p>
<p>Faz um dia que a Clara te passou seu painel da <strong>%s</strong> e parece que você ainda não conseguiu entrar.</p>
<p><a href="%s">Acessar meu painel</a></p>
<p>Quando entrar, a <strong>Sofia</strong> já te recebe lá pra fechar os detalhes da empresa em uns 5 minutos — horário, regra de preço, FAQs, essas coisinhas. Daí em diante a equipe (Clara, Marcos, Camila, Lia e Rafael) começa a trabalhar pra você.</p>
<p>Se o link tiver expirado, é só responder esse email que a gente te manda outro.</p>
<p>Até já,<br>Jotaduo</p>`, prefixName(name), htmlEscape(ctx.CompanyName), ctx.TenantURL)

	return subject, html, text, nil
}

func renderSecondReminder(ctx reminderContext) (string, string, string, error) {
	name := firstName(ctx.OwnerName)
	subject := "A Sofia ainda tá te esperando"
	text := fmt.Sprintf(`Oi%s,

A Sofia tá te esperando no painel da %s pra fechar a base — horário, preço, regras, esse tipo de coisa. É rapidinho (uns 5 minutos), e enquanto isso não acontecer a Clara, o Marcos e a Camila não conseguem começar a atender cliente de verdade.

Link pra entrar: %s

Se algo travou ou precisa de uma mão, só responder esse email que a gente puxa.

Jotaduo
`, prefixName(name), ctx.CompanyName, ctx.TenantURL)

	html := fmt.Sprintf(`<p>Oi%s,</p>
<p>A <strong>Sofia</strong> tá te esperando no painel da <strong>%s</strong> pra fechar a base — horário, preço, regras, esse tipo de coisa. É rapidinho (uns 5 minutos), e enquanto isso não acontecer a Clara, o Marcos e a Camila não conseguem começar a atender cliente de verdade.</p>
<p><a href="%s">Entrar agora</a></p>
<p>Se algo travou ou precisa de uma mão, só responder esse email que a gente puxa.</p>
<p>Jotaduo</p>`, prefixName(name), htmlEscape(ctx.CompanyName), ctx.TenantURL)

	return subject, html, text, nil
}

func renderLastReminder(ctx reminderContext) (string, string, string, error) {
	name := firstName(ctx.OwnerName)
	subject := "Último toque sobre seu painel da Jotaduo"
	text := fmt.Sprintf(`Oi%s,

Esse é o último lembrete sobre o painel da %s — não quero ficar enchendo seu inbox.

Se mudou de ideia ou agora não é a melhor hora, tudo bem. O painel fica disponível: %s

Se quiser que a gente desbloqueie em outro momento ou tirar uma dúvida antes de entrar, é só responder esse email.

Boa semana,
Jotaduo
`, prefixName(name), ctx.CompanyName, ctx.TenantURL)

	html := fmt.Sprintf(`<p>Oi%s,</p>
<p>Esse é o último lembrete sobre o painel da <strong>%s</strong> — não quero ficar enchendo seu inbox.</p>
<p>Se mudou de ideia ou agora não é a melhor hora, tudo bem. O painel fica disponível: <a href="%s">%s</a></p>
<p>Se quiser que a gente desbloqueie em outro momento ou tirar uma dúvida antes de entrar, é só responder esse email.</p>
<p>Boa semana,<br>Jotaduo</p>`, prefixName(name), htmlEscape(ctx.CompanyName), ctx.TenantURL, ctx.TenantURL)

	return subject, html, text, nil
}

// firstName grabs the first word of a contact name so emails read natural
// ("Oi Maria") instead of formal full-name. Returns empty if input is blank.
func firstName(full string) string {
	full = strings.TrimSpace(full)
	if full == "" {
		return ""
	}
	parts := strings.Fields(full)
	return parts[0]
}

// prefixName returns " Maria" (leading space) when the name is known, ""
// otherwise — lets the templates render "Oi Maria," or "Oi," without an
// awkward trailing space.
func prefixName(name string) string {
	if name == "" {
		return ""
	}
	return " " + name
}

// htmlEscape covers the few characters that could break the HTML body if a
// company name has them. We don't pull in html/template for these short
// strings — a tiny replacer is enough and avoids the extra dep.
var htmlEscaper = strings.NewReplacer(
	"&", "&amp;",
	"<", "&lt;",
	">", "&gt;",
	"\"", "&quot;",
	"'", "&#39;",
)

func htmlEscape(s string) string { return htmlEscaper.Replace(s) }
