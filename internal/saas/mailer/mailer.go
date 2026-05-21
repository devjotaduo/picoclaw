// Package mailer sends transactional emails (invites) using the same
// SMTP plumbing as internal/saas/alert but with multipart/alternative
// HTML+text bodies and per-recipient send.
package mailer

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	Host         string
	Port         int
	Username     string
	Password     string
	From         string
	AdminBaseURL string
}

func FromEnv(host string, port int, user, pass, alertFrom, mailerFrom, adminBaseURL string) Config {
	from := strings.TrimSpace(mailerFrom)
	if from == "" {
		from = strings.TrimSpace(alertFrom)
	}
	if from == "" {
		from = "contato@jotaduo.com"
	}
	return Config{
		Host:         strings.TrimSpace(host),
		Port:         port,
		Username:     user,
		Password:     pass,
		From:         from,
		AdminBaseURL: strings.TrimRight(strings.TrimSpace(adminBaseURL), "/"),
	}
}

func (c Config) Enabled() bool { return c.Host != "" && c.From != "" }

type Mailer struct{ cfg Config }

func New(cfg Config) *Mailer { return &Mailer{cfg: cfg} }

func (m *Mailer) Enabled() bool {
	if m == nil {
		return false
	}
	return m.cfg.Enabled()
}

func (m *Mailer) AdminBaseURL() string {
	if m == nil {
		return ""
	}
	return m.cfg.AdminBaseURL
}

func (m *Mailer) SendInviteEmail(to, tenantName, role, inviteURL string, expiresAt time.Time) {
	if m == nil || !m.cfg.Enabled() {
		log.Printf("mailer (disabled): invite for %s to %q tenant=%q link=%s", role, to, tenantName, inviteURL)
		return
	}
	data := InviteData{
		ToEmail:      to,
		TenantName:   tenantName,
		Role:         role,
		RoleLabel:    roleLabelPT(role),
		InviteURL:    inviteURL,
		ExpiresAt:    expiresAt,
		SupportEmail: m.cfg.From,
	}
	html, text, err := RenderInvite(data)
	if err != nil {
		log.Printf("mailer: render invite for %s failed: %v", to, err)
		return
	}
	subject := fmt.Sprintf("Convite — Painel %s no Jotaduo", tenantName)
	if err := m.Send(to, subject, html, text); err != nil {
		log.Printf("mailer: send invite to %s failed: %v", to, err)
	}
}

// SendCredentialsEmail delivers the "your dashboard is ready" message with
// login email + password AND a magic link printed together. Used by both
// manual /tenants/new and Sofia/Clara auto-provision. magicLink may be empty
// when Supabase isn't configured — in that case the email shows only email +
// senha.
func (m *Mailer) SendCredentialsEmail(to, tenantName, dashboardURL, loginEmail, loginPassword, magicLink string) {
	if m == nil || !m.cfg.Enabled() {
		log.Printf("mailer (disabled): credentials for %s tenant=%q url=%s magic=%t", to, tenantName, dashboardURL, magicLink != "")
		return
	}
	data := CredentialsData{
		ToEmail:       to,
		TenantName:    tenantName,
		DashboardURL:  dashboardURL,
		LoginEmail:    loginEmail,
		LoginPassword: loginPassword,
		MagicLink:     magicLink,
		SupportEmail:  m.cfg.From,
	}
	html, text, err := RenderCredentials(data)
	if err != nil {
		log.Printf("mailer: render credentials for %s failed: %v", to, err)
		return
	}
	subject := fmt.Sprintf("Acesso ao painel %s — Jotaduo", tenantName)
	if err := m.Send(to, subject, html, text); err != nil {
		log.Printf("mailer: send credentials to %s failed: %v", to, err)
	}
}

func (m *Mailer) Send(to, subject, htmlBody, textBody string) error {
	if !m.cfg.Enabled() {
		return fmt.Errorf("mailer disabled")
	}
	msg, err := buildMultipart(m.cfg.From, to, subject, htmlBody, textBody)
	if err != nil {
		return fmt.Errorf("build message: %w", err)
	}
	addr := net.JoinHostPort(m.cfg.Host, fmt.Sprint(m.cfg.Port))

	if m.cfg.Port == 465 {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return fmt.Errorf("dial: %w", err)
		}
		c, err := smtp.NewClient(conn, m.cfg.Host)
		if err != nil {
			_ = conn.Close()
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Close()
		return m.deliver(c, to, msg)
	}

	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	return m.deliver(c, to, msg)
}

func (m *Mailer) deliver(c *smtp.Client, to string, msg []byte) error {
	if m.cfg.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err := c.Mail(m.cfg.From); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt %s: %w", to, err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close: %w", err)
	}
	return c.Quit()
}

func buildMultipart(from, to, subject, htmlBody, textBody string) ([]byte, error) {
	boundary, err := randomBoundary()
	if err != nil {
		return nil, err
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "From: %s\r\n", from)
	fmt.Fprintf(&sb, "To: %s\r\n", to)
	fmt.Fprintf(&sb, "Subject: %s\r\n", encodeSubject(subject))
	fmt.Fprintf(&sb, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	sb.WriteString("MIME-Version: 1.0\r\n")
	fmt.Fprintf(&sb, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary)
	sb.WriteString("\r\n")

	fmt.Fprintf(&sb, "--%s\r\n", boundary)
	sb.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	sb.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	sb.WriteString(textBody)
	if !strings.HasSuffix(textBody, "\n") {
		sb.WriteString("\r\n")
	}

	fmt.Fprintf(&sb, "--%s\r\n", boundary)
	sb.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	sb.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	sb.WriteString(htmlBody)
	if !strings.HasSuffix(htmlBody, "\n") {
		sb.WriteString("\r\n")
	}

	fmt.Fprintf(&sb, "--%s--\r\n", boundary)
	return []byte(sb.String()), nil
}

func randomBoundary() (string, error) {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return "pico_" + hex.EncodeToString(b[:]), nil
}

func encodeSubject(s string) string {
	for _, r := range s {
		if r > 127 {
			return "=?utf-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
		}
	}
	return s
}

func roleLabelPT(role string) string {
	switch role {
	case "tenant_owner":
		return "Proprietário"
	case "tenant_admin":
		return "Administrador"
	case "operator":
		return "Operador(a)"
	case "viewer":
		return "Visualizador(a)"
	case "platform_admin":
		return "Administrador da Plataforma"
	default:
		return role
	}
}
