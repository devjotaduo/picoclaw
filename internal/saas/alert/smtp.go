// Package alert sends operational emails when something needs human attention:
// a tenant fails to provision/start, or the data directory fills up. It is
// intentionally minimal — one ticker, one alert type per concern, with a
// per-key cooldown so a stuck condition doesn't flood the inbox.
package alert

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"sync"
	"time"
)

// Config is populated from env vars by the caller. If Host is empty the
// alerter degrades gracefully to a no-op (with a log line).
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       []string
	Cooldown time.Duration
}

func ConfigFromEnv(host string, port int, user, pass, from, toCSV string) Config {
	var to []string
	for _, addr := range strings.Split(toCSV, ",") {
		if a := strings.TrimSpace(addr); a != "" {
			to = append(to, a)
		}
	}
	return Config{
		Host:     strings.TrimSpace(host),
		Port:     port,
		Username: user,
		Password: pass,
		From:     strings.TrimSpace(from),
		To:       to,
		Cooldown: 30 * time.Minute,
	}
}

func (c Config) Enabled() bool {
	return c.Host != "" && c.From != "" && len(c.To) > 0
}

// Notifier sends emails with cooldown so repeated firings of the same alert
// key don't flood the inbox.
type Notifier struct {
	cfg Config

	mu       sync.Mutex
	lastSent map[string]time.Time
}

func New(cfg Config) *Notifier {
	if cfg.Cooldown <= 0 {
		cfg.Cooldown = 30 * time.Minute
	}
	return &Notifier{cfg: cfg, lastSent: map[string]time.Time{}}
}

// Notify sends one email. The key is used to enforce the cooldown — pass the
// same key for repeated firings of the same underlying condition.
func (n *Notifier) Notify(key, subject, body string) {
	if !n.cfg.Enabled() {
		log.Printf("alert (smtp disabled): [%s] %s — %s", key, subject, body)
		return
	}
	n.mu.Lock()
	if last, ok := n.lastSent[key]; ok && time.Since(last) < n.cfg.Cooldown {
		n.mu.Unlock()
		return
	}
	n.lastSent[key] = time.Now()
	n.mu.Unlock()

	if err := n.send(subject, body); err != nil {
		log.Printf("alert: send %q failed: %v", subject, err)
	}
}

func (n *Notifier) send(subject, body string) error {
	addr := net.JoinHostPort(n.cfg.Host, fmt.Sprint(n.cfg.Port))
	msg := buildMessage(n.cfg.From, n.cfg.To, subject, body)

	if n.cfg.Port == 465 {
		// Implicit TLS (SMTPS).
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: n.cfg.Host})
		if err != nil {
			return fmt.Errorf("dial: %w", err)
		}
		c, err := smtp.NewClient(conn, n.cfg.Host)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Close()
		return n.deliver(c, msg)
	}
	// STARTTLS path (587 or 25)
	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: n.cfg.Host}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	return n.deliver(c, msg)
}

func (n *Notifier) deliver(c *smtp.Client, msg []byte) error {
	if n.cfg.Username != "" {
		auth := smtp.PlainAuth("", n.cfg.Username, n.cfg.Password, n.cfg.Host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err := c.Mail(n.cfg.From); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	for _, to := range n.cfg.To {
		if err := c.Rcpt(to); err != nil {
			return fmt.Errorf("rcpt %s: %w", to, err)
		}
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

func buildMessage(from string, to []string, subject, body string) []byte {
	var sb strings.Builder
	fmt.Fprintf(&sb, "From: %s\r\n", from)
	fmt.Fprintf(&sb, "To: %s\r\n", strings.Join(to, ", "))
	fmt.Fprintf(&sb, "Subject: %s\r\n", subject)
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return []byte(sb.String())
}
