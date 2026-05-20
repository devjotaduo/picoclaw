package api

import (
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestReminderRenderAllTemplates(t *testing.T) {
	t.Parallel()
	ctx := reminderContext{
		OwnerName:   "Maria da Silva",
		CompanyName: "Acme Móveis",
		TenantURL:   "https://acme.jotaduo.com/",
	}
	cases := []struct {
		template       store.ReminderTemplate
		subjectMust    []string
		bodyMust       []string
		mustNotContain []string
	}{
		{
			store.ReminderTemplateFirst,
			[]string{"painel"},
			[]string{"Oi Maria", "Acme Móveis", "https://acme.jotaduo.com/", "Sofia"},
			[]string{"IA", "ChatGPT", "automação", "bot"},
		},
		{
			store.ReminderTemplateSecond,
			[]string{"Sofia"},
			[]string{"Oi Maria", "Acme Móveis", "https://acme.jotaduo.com/", "Sofia"},
			[]string{"IA", "ChatGPT", "automação", "bot"},
		},
		{
			store.ReminderTemplateLast,
			[]string{"Último"},
			[]string{"Oi Maria", "Acme Móveis", "https://acme.jotaduo.com/"},
			[]string{"IA", "ChatGPT", "automação", "bot"},
		},
	}
	for _, c := range cases {
		t.Run(string(c.template), func(t *testing.T) {
			subject, html, text, err := reminderRender(c.template, ctx)
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			for _, s := range c.subjectMust {
				if !strings.Contains(subject, s) {
					t.Errorf("subject missing %q, got %q", s, subject)
				}
			}
			for _, s := range c.bodyMust {
				if !strings.Contains(html, s) {
					t.Errorf("html missing %q\n--- html ---\n%s", s, html)
				}
				if !strings.Contains(text, s) {
					t.Errorf("text missing %q\n--- text ---\n%s", s, text)
				}
			}
			for _, s := range c.mustNotContain {
				if strings.Contains(html, s) || strings.Contains(text, s) {
					t.Errorf("template leaked tech jargon %q", s)
				}
			}
		})
	}
}

func TestReminderRenderUnknownTemplate(t *testing.T) {
	t.Parallel()
	_, _, _, err := reminderRender(store.ReminderTemplate("does-not-exist"), reminderContext{})
	if err == nil {
		t.Fatal("expected error for unknown template")
	}
}

func TestReminderRenderEmptyName(t *testing.T) {
	t.Parallel()
	// Without a contact name we render "Oi," not "Oi ," — no trailing space.
	_, html, text, err := reminderRender(store.ReminderTemplateFirst, reminderContext{
		CompanyName: "Acme",
		TenantURL:   "https://x/",
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(html, "Oi ,") || strings.Contains(text, "Oi ,") {
		t.Errorf("unexpected awkward greeting in template without name")
	}
	if !strings.Contains(html, "Oi,") {
		t.Errorf("expected 'Oi,' in html greeting")
	}
}

func TestHTMLEscapeOnCompanyName(t *testing.T) {
	t.Parallel()
	_, html, _, err := reminderRender(store.ReminderTemplateFirst, reminderContext{
		OwnerName:   "Maria",
		CompanyName: `<script>alert("xss")</script>`,
		TenantURL:   "https://x/",
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if strings.Contains(html, "<script>") {
		t.Errorf("html body did not escape script tag in company name:\n%s", html)
	}
	if !strings.Contains(html, "&lt;script&gt;") {
		t.Errorf("html body should contain escaped form")
	}
}

func TestFirstNameAndPrefix(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"Maria da Silva": " Maria",
		"  Maria  ":      " Maria",
		"":               "",
		"   ":            "",
		"José":           " José",
	}
	for in, want := range cases {
		if got := prefixName(firstName(in)); got != want {
			t.Errorf("prefixName(firstName(%q)) = %q, want %q", in, got, want)
		}
	}
}
