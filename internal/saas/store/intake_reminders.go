package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// ReminderChannel identifies how the reminder is delivered. Email is the
// only fully wired channel today; whatsapp is reserved for when a
// transactional WA Business API is plugged into the controlplane.
type ReminderChannel string

const (
	ReminderChannelEmail    ReminderChannel = "email"
	ReminderChannelWhatsApp ReminderChannel = "whatsapp"
)

// ReminderTemplate names which copy the worker should render. The templates
// themselves live in code (internal/saas/api/reminder_templates.go) so we
// can iterate without database migrations.
type ReminderTemplate string

const (
	ReminderTemplateFirst  ReminderTemplate = "first"  // T+24h
	ReminderTemplateSecond ReminderTemplate = "second" // T+72h
	ReminderTemplateLast   ReminderTemplate = "last"   // T+7d
)

// IntakeReminder is one row in the queue. attempts is bumped on every send
// failure; the worker gives up after a small number of tries and leaves the
// row with last_error set for operator inspection.
type IntakeReminder struct {
	ID              int64
	IntakeID        string
	ScheduledAt     time.Time
	Channel         ReminderChannel
	Template        ReminderTemplate
	SentAt          *time.Time
	CancelledAt     *time.Time
	CancelledReason *string
	Attempts        int
	LastError       *string
	CreatedAt       time.Time
}

type IntakeReminderStore struct{ DB *DB }

const reminderCols = `id, intake_id, scheduled_at, channel, template, sent_at,
    cancelled_at, cancelled_reason, attempts, last_error, created_at`

func scanReminder(row pgx.Row) (*IntakeReminder, error) {
	var r IntakeReminder
	err := row.Scan(
		&r.ID, &r.IntakeID, &r.ScheduledAt, &r.Channel, &r.Template,
		&r.SentAt, &r.CancelledAt, &r.CancelledReason, &r.Attempts,
		&r.LastError, &r.CreatedAt,
	)
	return &r, err
}

// Schedule inserts one reminder. Caller passes the absolute scheduled time
// (not an offset) so testing can pin "now" without touching the store.
func (s *IntakeReminderStore) Schedule(ctx context.Context, intakeID string, scheduledAt time.Time, channel ReminderChannel, template ReminderTemplate) (*IntakeReminder, error) {
	const q = `INSERT INTO intake_reminders (intake_id, scheduled_at, channel, template)
	           VALUES ($1, $2, $3, $4)
	           RETURNING ` + reminderCols
	return scanReminder(s.DB.Pool.QueryRow(ctx, q, intakeID, scheduledAt, channel, template))
}

// ListDue returns reminders that should fire by `now` and haven't been
// sent or cancelled yet. Sorted by scheduled_at so older work goes first.
// Limit caps a single worker tick so a backlog doesn't pin the db connection.
func (s *IntakeReminderStore) ListDue(ctx context.Context, now time.Time, limit int) ([]*IntakeReminder, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `SELECT ` + reminderCols + ` FROM intake_reminders
	           WHERE sent_at IS NULL AND cancelled_at IS NULL
	             AND scheduled_at <= $1
	           ORDER BY scheduled_at ASC
	           LIMIT $2`
	rows, err := s.DB.Pool.Query(ctx, q, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*IntakeReminder
	for rows.Next() {
		r, err := scanReminder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// MarkSent flips sent_at on a successful delivery.
func (s *IntakeReminderStore) MarkSent(ctx context.Context, id int64, at time.Time) error {
	const q = `UPDATE intake_reminders SET sent_at = $2 WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id, at)
	return err
}

// MarkFailed bumps the attempt counter and stores the latest error. The
// worker decides at the call site whether to keep retrying.
func (s *IntakeReminderStore) MarkFailed(ctx context.Context, id int64, errMsg string) error {
	const q = `UPDATE intake_reminders
	           SET attempts = attempts + 1, last_error = $2
	           WHERE id = $1`
	_, err := s.DB.Pool.Exec(ctx, q, id, errMsg)
	return err
}

// CancelByIntake cancels every pending reminder for the given intake.
// Used when the owner first logs in — there's nothing to remind about
// once they've engaged.
func (s *IntakeReminderStore) CancelByIntake(ctx context.Context, intakeID, reason string) (int64, error) {
	const q = `UPDATE intake_reminders
	           SET cancelled_at = now(), cancelled_reason = $2
	           WHERE intake_id = $1 AND sent_at IS NULL AND cancelled_at IS NULL`
	tag, err := s.DB.Pool.Exec(ctx, q, intakeID, reason)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// CancelByTenant resolves the intake from the linked tenant and cancels its
// pending reminders. Returns (count, error). A tenant with no linked intake
// is a no-op (0, nil).
func (s *IntakeReminderStore) CancelByTenant(ctx context.Context, tenantID, reason string) (int64, error) {
	const q = `UPDATE intake_reminders
	           SET cancelled_at = now(), cancelled_reason = $2
	           WHERE sent_at IS NULL AND cancelled_at IS NULL
	             AND intake_id IN (
	               SELECT id FROM company_intakes WHERE linked_tenant_id = $1
	             )`
	tag, err := s.DB.Pool.Exec(ctx, q, tenantID, reason)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ListForIntake returns every reminder for an intake, sent + pending +
// cancelled. Useful for admin inspection.
func (s *IntakeReminderStore) ListForIntake(ctx context.Context, intakeID string) ([]*IntakeReminder, error) {
	const q = `SELECT ` + reminderCols + ` FROM intake_reminders
	           WHERE intake_id = $1
	           ORDER BY scheduled_at ASC`
	rows, err := s.DB.Pool.Query(ctx, q, intakeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*IntakeReminder
	for rows.Next() {
		r, err := scanReminder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
