package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrCompanyIntakeNotFound = errors.New("company intake not found")

type CompanyIntakeStatus string

const (
	CompanyIntakeDraft       CompanyIntakeStatus = "draft"
	CompanyIntakeReportReady CompanyIntakeStatus = "report_ready"
	CompanyIntakeSubmitted   CompanyIntakeStatus = "submitted"
	CompanyIntakeReviewed    CompanyIntakeStatus = "reviewed"
	CompanyIntakeLinked      CompanyIntakeStatus = "linked"
)

type CompanyIntake struct {
	ID                string              `json:"id"`
	Status            CompanyIntakeStatus `json:"status"`
	CompanyName       string              `json:"company_name"`
	ContactName       string              `json:"contact_name"`
	ContactEmail      string              `json:"contact_email"`
	ContactWhatsApp   string              `json:"contact_whatsapp"`
	AnswersJSON       json.RawMessage     `json:"answers"`
	AttachmentsJSON   json.RawMessage     `json:"attachments"`
	AudioTranscript   string              `json:"audio_transcript"`
	ReportJSON        json.RawMessage     `json:"report"`
	PublicSummaryJSON json.RawMessage     `json:"public_summary"`
	ChatMessagesJSON  json.RawMessage     `json:"chat_messages"`
	LinkedTenantID    *string             `json:"linked_tenant_id"`
	CRMContactID      *int64              `json:"crm_contact_id"`
	CRMCompanyID      *int64              `json:"crm_company_id"`
	CRMDealID         *int64              `json:"crm_deal_id"`
	Source            string              `json:"source"`
	CreatedAt         time.Time           `json:"created_at"`
	UpdatedAt         time.Time           `json:"updated_at"`
	SubmittedAt       *time.Time          `json:"submitted_at"`
	ReviewedAt        *time.Time          `json:"reviewed_at"`
	LinkedAt          *time.Time          `json:"linked_at"`
	QualifiedAt       *time.Time          `json:"qualified_at"`
}

// companyIntakeReturning is the canonical column list used in every RETURNING
// clause and SELECT projection for company_intakes. Order must match
// scanCompanyIntakeInto exactly.
const companyIntakeReturning = `id, status, company_name, contact_name, contact_email, contact_whatsapp,
	answers_json, attachments_json, audio_transcript, report_json, public_summary_json,
	chat_messages, linked_tenant_id, crm_contact_id, crm_company_id, crm_deal_id, source,
	created_at, updated_at, submitted_at, reviewed_at, linked_at, qualified_at`

type CompanyIntakeStore struct{ DB *DB }

func NewCompanyIntakeID() (string, error) {
	token, err := randomToken(12)
	if err != nil {
		return "", err
	}
	return "ci_" + token, nil
}

func NewCompanyIntakeResumeToken() (string, error) {
	return randomToken(32)
}

func CompanyIntakeTokenHash(raw string) string {
	return hashToken(raw)
}

func (s *CompanyIntakeStore) Create(ctx context.Context, intake *CompanyIntake, resumeTokenHash, ipHash, userAgent string) error {
	const q = `
		INSERT INTO company_intakes
			(id, resume_token_hash, status, answers_json, attachments_json, report_json, public_summary_json, source, ip_hash, user_agent)
		VALUES
			($1, $2, $3, COALESCE($4, '{}'::jsonb), COALESCE($5, '[]'::jsonb), '{}'::jsonb, '{}'::jsonb, $6, $7, $8)
		RETURNING ` + companyIntakeReturning
	if intake.Status == "" {
		intake.Status = CompanyIntakeDraft
	}
	if len(intake.AnswersJSON) == 0 {
		intake.AnswersJSON = json.RawMessage(`{}`)
	}
	if len(intake.AttachmentsJSON) == 0 {
		intake.AttachmentsJSON = json.RawMessage(`[]`)
	}
	if intake.Source == "" {
		intake.Source = "pre-cadastro"
	}
	return scanCompanyIntakeInto(intake, s.DB.Pool.QueryRow(ctx, q,
		intake.ID,
		resumeTokenHash,
		intake.Status,
		intake.AnswersJSON,
		intake.AttachmentsJSON,
		intake.Source,
		ipHash,
		userAgent,
	))
}

func (s *CompanyIntakeStore) Get(ctx context.Context, id string) (*CompanyIntake, error) {
	const q = `
		SELECT ` + companyIntakeReturning + `
		FROM company_intakes
		WHERE id = $1`
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id))
}

func (s *CompanyIntakeStore) GetByToken(ctx context.Context, id, resumeTokenHash string) (*CompanyIntake, error) {
	const q = `
		SELECT ` + companyIntakeReturning + `
		FROM company_intakes
		WHERE id = $1 AND resume_token_hash = $2`
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash))
}

func (s *CompanyIntakeStore) SaveDraft(ctx context.Context, id, resumeTokenHash, companyName, contactName, contactEmail, contactWhatsApp string, answers json.RawMessage, audioTranscript string) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET company_name = $3,
			contact_name = $4,
			contact_email = $5,
			contact_whatsapp = $6,
			answers_json = COALESCE($7, '{}'::jsonb),
			audio_transcript = $8,
			updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash, companyName, contactName, contactEmail, contactWhatsApp, answers, audioTranscript))
}

func (s *CompanyIntakeStore) SaveAttachments(ctx context.Context, id, resumeTokenHash string, attachments json.RawMessage) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET attachments_json = COALESCE($3, '[]'::jsonb), updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash, attachments))
}

func (s *CompanyIntakeStore) SaveReport(ctx context.Context, id, resumeTokenHash string, report, publicSummary json.RawMessage) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET report_json = COALESCE($3, '{}'::jsonb),
			public_summary_json = COALESCE($4, '{}'::jsonb),
			status = CASE WHEN status = 'draft' THEN 'report_ready' ELSE status END,
			updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash, report, publicSummary))
}

func (s *CompanyIntakeStore) Submit(ctx context.Context, id, resumeTokenHash string) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET status = 'submitted', submitted_at = COALESCE(submitted_at, now()), updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash))
}

func (s *CompanyIntakeStore) List(ctx context.Context, status string, limit int) ([]*CompanyIntake, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	q := `
		SELECT ` + companyIntakeReturning + `
		FROM company_intakes`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE status = $1`
		args = append(args, status)
	}
	q += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, len(args)+1)
	args = append(args, limit)
	rows, err := s.DB.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*CompanyIntake
	for rows.Next() {
		intake, err := scanCompanyIntake(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, intake)
	}
	return out, rows.Err()
}

func (s *CompanyIntakeStore) SetStatus(ctx context.Context, id string, status CompanyIntakeStatus) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET status = $2,
			reviewed_at = CASE WHEN $2 = 'reviewed' THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
			updated_at = now()
		WHERE id = $1
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, status))
}

func (s *CompanyIntakeStore) LinkTenant(ctx context.Context, id, tenantID string) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET linked_tenant_id = $2, status = 'linked', linked_at = COALESCE(linked_at, now()), updated_at = now()
		WHERE id = $1
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, tenantID))
}

func scanCompanyIntake(row pgx.Row) (*CompanyIntake, error) {
	var intake CompanyIntake
	err := scanCompanyIntakeInto(&intake, row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCompanyIntakeNotFound
	}
	return &intake, err
}

func scanCompanyIntakeInto(intake *CompanyIntake, row pgx.Row) error {
	return row.Scan(
		&intake.ID,
		&intake.Status,
		&intake.CompanyName,
		&intake.ContactName,
		&intake.ContactEmail,
		&intake.ContactWhatsApp,
		&intake.AnswersJSON,
		&intake.AttachmentsJSON,
		&intake.AudioTranscript,
		&intake.ReportJSON,
		&intake.PublicSummaryJSON,
		&intake.ChatMessagesJSON,
		&intake.LinkedTenantID,
		&intake.CRMContactID,
		&intake.CRMCompanyID,
		&intake.CRMDealID,
		&intake.Source,
		&intake.CreatedAt,
		&intake.UpdatedAt,
		&intake.SubmittedAt,
		&intake.ReviewedAt,
		&intake.LinkedAt,
		&intake.QualifiedAt,
	)
}

// AppendChatMessage appends one JSONB message object to chat_messages and
// returns the full updated intake row. Used by the Clara agent endpoint to
// persist each turn before/after the LLM call so the transcript survives a
// dropped SSE connection. The token check matches the SaveDraft policy: only
// active intakes (draft/report_ready) may be appended to.
func (s *CompanyIntakeStore) AppendChatMessage(
	ctx context.Context, id, resumeTokenHash string, message json.RawMessage,
) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET chat_messages = chat_messages || $3::jsonb, updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	// Single-element JSONB array wrapper so the `||` concat operator merges
	// arrays instead of objects.
	wrapped := append(append([]byte{'['}, message...), ']')
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash, wrapped))
}

// MarkQualified sets qualified_at the first time the agent calls the
// `mark_qualified` tool. Idempotent: subsequent calls keep the original
// timestamp so analytics know when qualification first happened.
func (s *CompanyIntakeStore) MarkQualified(
	ctx context.Context, id, resumeTokenHash string,
) (*CompanyIntake, error) {
	const q = `
		UPDATE company_intakes
		SET qualified_at = COALESCE(qualified_at, now()), updated_at = now()
		WHERE id = $1 AND resume_token_hash = $2 AND status IN ('draft', 'report_ready')
		RETURNING ` + companyIntakeReturning
	return scanCompanyIntake(s.DB.Pool.QueryRow(ctx, q, id, resumeTokenHash))
}
