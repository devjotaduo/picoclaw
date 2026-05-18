package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrSkillIntegrationNotFound = errors.New("skill integration not found")

type SkillIntegrationSettings struct {
	TenantID    string          `json:"tenant_id"`
	SkillName   string          `json:"skill_name"`
	ValuesJSON  json.RawMessage `json:"values_json"`
	SecretsJSON json.RawMessage `json:"secrets_json"`
	UpdatedBy   *int64          `json:"updated_by"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type SkillIntegrationStore struct{ DB *DB }

const skillIntegrationCols = `tenant_id, skill_name, values_json, secrets_json, updated_by, updated_at`

func (s *SkillIntegrationStore) Get(ctx context.Context, tenantID, skillName string) (*SkillIntegrationSettings, error) {
	const q = `SELECT ` + skillIntegrationCols + `
		FROM tenant_skill_integrations
		WHERE tenant_id = $1 AND skill_name = $2`
	return scanSkillIntegration(s.DB.Pool.QueryRow(ctx, q, tenantID, skillName))
}

func (s *SkillIntegrationStore) ListForTenant(ctx context.Context, tenantID string) ([]*SkillIntegrationSettings, error) {
	const q = `SELECT ` + skillIntegrationCols + `
		FROM tenant_skill_integrations
		WHERE tenant_id = $1
		ORDER BY skill_name ASC`
	rows, err := s.DB.Pool.Query(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*SkillIntegrationSettings{}
	for rows.Next() {
		item, err := scanSkillIntegration(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *SkillIntegrationStore) Upsert(ctx context.Context, item *SkillIntegrationSettings) (*SkillIntegrationSettings, error) {
	const q = `
		INSERT INTO tenant_skill_integrations
			(tenant_id, skill_name, values_json, secrets_json, updated_by, updated_at)
		VALUES
			($1, $2, COALESCE($3::jsonb, '{}'::jsonb), COALESCE($4::jsonb, '{}'::jsonb), $5, now())
		ON CONFLICT (tenant_id, skill_name) DO UPDATE SET
			values_json = EXCLUDED.values_json,
			secrets_json = EXCLUDED.secrets_json,
			updated_by = EXCLUDED.updated_by,
			updated_at = now()
		RETURNING ` + skillIntegrationCols
	values := ensureJSONObject(item.ValuesJSON)
	secrets := ensureJSONObject(item.SecretsJSON)
	return scanSkillIntegration(s.DB.Pool.QueryRow(
		ctx,
		q,
		item.TenantID,
		item.SkillName,
		[]byte(values),
		[]byte(secrets),
		item.UpdatedBy,
	))
}

func (s *SkillIntegrationStore) Delete(ctx context.Context, tenantID, skillName string) error {
	const q = `DELETE FROM tenant_skill_integrations WHERE tenant_id = $1 AND skill_name = $2`
	_, err := s.DB.Pool.Exec(ctx, q, tenantID, skillName)
	return err
}

func scanSkillIntegration(row pgx.Row) (*SkillIntegrationSettings, error) {
	var item SkillIntegrationSettings
	err := row.Scan(
		&item.TenantID,
		&item.SkillName,
		&item.ValuesJSON,
		&item.SecretsJSON,
		&item.UpdatedBy,
		&item.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSkillIntegrationNotFound
	}
	return &item, err
}

func ensureJSONObject(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return json.RawMessage(`{}`)
	}
	return raw
}
