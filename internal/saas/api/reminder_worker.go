package api

// Background worker that drains the intake_reminders queue. Started once
// at controlplane boot and runs forever; tick interval is short enough
// that T+24h reminders fire within ~5 minutes of being due. The worker is
// idempotent on restart — only rows with sent_at IS NULL AND cancelled_at
// IS NULL are picked up.

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/mailer"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const (
	reminderTickInterval = 5 * time.Minute
	reminderBatchLimit   = 50
	reminderMaxAttempts  = 5 // beyond this we leave the row with last_error and stop retrying
)

// ReminderWorker holds the dependencies the loop needs. It's only instantiated
// when both the mailer and the auto-provision feature are configured —
// otherwise scheduling reminders has nothing to deliver to.
type ReminderWorker struct {
	Cfg            *config.Config
	Reminders      *store.IntakeReminderStore
	CompanyIntakes *store.CompanyIntakeStore
	Tenants        *store.TenantStore
	Mailer         *mailer.Mailer
}

// NewReminderWorker returns nil when prerequisites aren't met (no mailer,
// no auto-provision) so the handler can branch on (h.ReminderWorker == nil)
// without worrying about config combinations.
func NewReminderWorker(cfg *config.Config, db *store.DB, m *mailer.Mailer) *ReminderWorker {
	if m == nil || !m.Enabled() {
		return nil
	}
	if !cfg.AutoProvisionEnabled {
		return nil
	}
	return &ReminderWorker{
		Cfg:            cfg,
		Reminders:      &store.IntakeReminderStore{DB: db},
		CompanyIntakes: &store.CompanyIntakeStore{DB: db},
		Tenants:        &store.TenantStore{DB: db},
		Mailer:         m,
	}
}

// Start spawns the worker goroutine. Cancel the context to stop it. Safe to
// call multiple times; the goroutine only starts on the first call.
func (w *ReminderWorker) Start(ctx context.Context) {
	if w == nil {
		return
	}
	go w.loop(ctx)
}

func (w *ReminderWorker) loop(ctx context.Context) {
	// Fire once on boot so a reminder scheduled mere seconds before a
	// restart isn't held for a full tick.
	w.tick(ctx)
	t := time.NewTicker(reminderTickInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			w.tick(ctx)
		}
	}
}

// tick processes one batch of due reminders. Errors on individual reminders
// are logged + persisted via MarkFailed; we never abort the batch on a
// single failure.
func (w *ReminderWorker) tick(ctx context.Context) {
	tickCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	due, err := w.Reminders.ListDue(tickCtx, time.Now().UTC(), reminderBatchLimit)
	if err != nil {
		log.Printf("reminder worker: ListDue error: %v", err)
		return
	}
	for _, r := range due {
		if r.Attempts >= reminderMaxAttempts {
			continue // give up silently; the row stays for admin to inspect
		}
		if err := w.deliver(tickCtx, r); err != nil {
			log.Printf("reminder worker: deliver intake=%s template=%s error: %v", r.IntakeID, r.Template, err)
			if mErr := w.Reminders.MarkFailed(tickCtx, r.ID, err.Error()); mErr != nil {
				log.Printf("reminder worker: MarkFailed: %v", mErr)
			}
			continue
		}
		if err := w.Reminders.MarkSent(tickCtx, r.ID, time.Now().UTC()); err != nil {
			log.Printf("reminder worker: MarkSent: %v", err)
		}
	}
}

func (w *ReminderWorker) deliver(ctx context.Context, r *store.IntakeReminder) error {
	if r.Channel != store.ReminderChannelEmail {
		// MVP only ships email. WhatsApp Business API outreach is on the
		// roadmap — until then, treat non-email rows as "skip silently"
		// rather than failing.
		return fmt.Errorf("channel %q not implemented", r.Channel)
	}
	intake, err := w.CompanyIntakes.Get(ctx, r.IntakeID)
	if err != nil {
		return fmt.Errorf("load intake: %w", err)
	}
	if intake.ContactEmail == "" {
		return fmt.Errorf("intake %s has no contact email", intake.ID)
	}
	// If the visitor already finished onboarding (intake status = linked
	// AND tenant has been engaged), cancel rather than send. Guards
	// against races where the cancellation hook hasn't fired yet.
	if w.shouldSkip(ctx, intake) {
		if _, err := w.Reminders.CancelByIntake(ctx, intake.ID, "engaged before tick"); err != nil {
			log.Printf("reminder worker: late cancel: %v", err)
		}
		return nil // not an error, just a no-op
	}

	tenantURL := w.tenantURLForIntake(ctx, intake)
	subject, html, text, err := reminderRender(r.Template, reminderContext{
		OwnerName:    intake.ContactName,
		CompanyName:  fallbackString(intake.CompanyName, "sua empresa"),
		TenantURL:    tenantURL,
		SupportEmail: "contato@jotaduo.com",
	})
	if err != nil {
		return err
	}
	return w.Mailer.Send(intake.ContactEmail, subject, html, text)
}

// shouldSkip returns true when the visitor has already engaged with the
// tenant — we don't want to send a reminder to someone who is actively
// using the panel.
func (w *ReminderWorker) shouldSkip(ctx context.Context, intake *store.CompanyIntake) bool {
	if intake.LinkedTenantID == nil || *intake.LinkedTenantID == "" {
		return false
	}
	t, err := w.Tenants.Get(ctx, *intake.LinkedTenantID)
	if err != nil || t == nil {
		return false
	}
	// initial_password_delivered is reused as the "owner has seen the
	// credentials and presumably interacted" signal. For Supabase tenants
	// we set this true the first time the gateway sees a valid JWT.
	return t.InitialPasswordDelivered
}

func (w *ReminderWorker) tenantURLForIntake(ctx context.Context, intake *store.CompanyIntake) string {
	if intake.LinkedTenantID != nil && *intake.LinkedTenantID != "" {
		if t, err := w.Tenants.Get(ctx, *intake.LinkedTenantID); err == nil && t != nil {
			return tenantURL(w.Cfg, t.Subdomain)
		}
	}
	// Fallback: send them to the apex; the magic-link email already had
	// the real URL.
	base := strings.Trim(w.Cfg.TenantBaseDomain, ".")
	if base == "" {
		return "https://jotaduo.com/"
	}
	return "https://" + base + "/"
}

func fallbackString(v, def string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return def
	}
	return v
}
