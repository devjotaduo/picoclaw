package mailer

import (
	"bytes"
	"embed"
	"fmt"
	htemplate "html/template"
	ttemplate "text/template"
	"time"
)

//go:embed templates/*.tmpl
var templateFS embed.FS

type InviteData struct {
	ToEmail      string
	TenantName   string
	Role         string
	RoleLabel    string
	InviteURL    string
	ExpiresAt    time.Time
	SupportEmail string
}

func (d InviteData) FormattedExpiry() string {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return d.ExpiresAt.UTC().Format("02/01/2006 às 15:04") + " (UTC)"
	}
	return d.ExpiresAt.In(loc).Format("02/01/2006 às 15:04") + " (horário de Brasília)"
}

// CredentialsData is the payload for the "your dashboard is ready" mailing
// sent after provisioning a tenant. Carries both forms of access — login
// email + password AND a Supabase magic link — together in one message so
// the owner can pick whichever is convenient.
type CredentialsData struct {
	ToEmail       string
	TenantName    string
	DashboardURL  string
	LoginEmail    string
	LoginPassword string
	// MagicLink is the optional single-use Supabase action URL. Empty when
	// Supabase isn't configured for this deployment.
	MagicLink    string
	SupportEmail string
}

var (
	inviteHTMLTpl      *htemplate.Template
	inviteTextTpl      *ttemplate.Template
	credentialsHTMLTpl *htemplate.Template
	credentialsTextTpl *ttemplate.Template
)

func init() {
	var err error
	inviteHTMLTpl, err = htemplate.New("invite.html.tmpl").Funcs(htemplate.FuncMap{
		"formattedExpiry": func(d InviteData) string { return d.FormattedExpiry() },
	}).ParseFS(templateFS, "templates/invite.html.tmpl")
	if err != nil {
		panic(fmt.Sprintf("mailer: parse invite.html.tmpl: %v", err))
	}
	inviteTextTpl, err = ttemplate.New("invite.txt.tmpl").Funcs(ttemplate.FuncMap{
		"formattedExpiry": func(d InviteData) string { return d.FormattedExpiry() },
	}).ParseFS(templateFS, "templates/invite.txt.tmpl")
	if err != nil {
		panic(fmt.Sprintf("mailer: parse invite.txt.tmpl: %v", err))
	}
	credentialsHTMLTpl, err = htemplate.New("credentials.html.tmpl").ParseFS(templateFS, "templates/credentials.html.tmpl")
	if err != nil {
		panic(fmt.Sprintf("mailer: parse credentials.html.tmpl: %v", err))
	}
	credentialsTextTpl, err = ttemplate.New("credentials.txt.tmpl").ParseFS(templateFS, "templates/credentials.txt.tmpl")
	if err != nil {
		panic(fmt.Sprintf("mailer: parse credentials.txt.tmpl: %v", err))
	}
}

func RenderInvite(data InviteData) (html, text string, err error) {
	var hbuf, tbuf bytes.Buffer
	if err := inviteHTMLTpl.Execute(&hbuf, data); err != nil {
		return "", "", fmt.Errorf("html: %w", err)
	}
	if err := inviteTextTpl.Execute(&tbuf, data); err != nil {
		return "", "", fmt.Errorf("text: %w", err)
	}
	return hbuf.String(), tbuf.String(), nil
}

func RenderCredentials(data CredentialsData) (html, text string, err error) {
	var hbuf, tbuf bytes.Buffer
	if err := credentialsHTMLTpl.Execute(&hbuf, data); err != nil {
		return "", "", fmt.Errorf("html: %w", err)
	}
	if err := credentialsTextTpl.Execute(&tbuf, data); err != nil {
		return "", "", fmt.Errorf("text: %w", err)
	}
	return hbuf.String(), tbuf.String(), nil
}
