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

var (
	inviteHTMLTpl *htemplate.Template
	inviteTextTpl *ttemplate.Template
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
