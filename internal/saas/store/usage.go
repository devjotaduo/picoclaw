package store

import (
	"context"
	"time"
)

type UsageLog struct {
	ID               int64
	TenantID         string
	Timestamp        time.Time
	Provider         string
	Model            string
	PromptTokens     int
	CompletionTokens int
	CostUSD          float64
}

type UsageStore struct{ DB *DB }

// InsertIgnoreDup inserts if (tenant_id, ts, model, prompt_tokens, completion_tokens)
// is new. Avoids double-counting when the poller is restarted with overlapping windows.
func (s *UsageStore) InsertIgnoreDup(ctx context.Context, u *UsageLog) (bool, error) {
	const q = `
		INSERT INTO usage_logs (tenant_id, ts, provider, model, prompt_tokens, completion_tokens, cost_usd)
		SELECT $1, $2, $3, $4, $5, $6, $7
		WHERE NOT EXISTS (
			SELECT 1 FROM usage_logs
			WHERE tenant_id = $1 AND ts = $2 AND model = $4
			  AND prompt_tokens = $5 AND completion_tokens = $6
		)
		RETURNING id`
	var id int64
	err := s.DB.Pool.QueryRow(ctx, q,
		u.TenantID, u.Timestamp, u.Provider, u.Model,
		u.PromptTokens, u.CompletionTokens, u.CostUSD,
	).Scan(&id)
	if err != nil {
		// pgx.ErrNoRows means the duplicate filter matched — that's success, not failure.
		if err.Error() == "no rows in result set" {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// Summary aggregates usage for a tenant in a time range.
type Summary struct {
	TotalTokens      int     `json:"total_tokens"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	CostUSD          float64 `json:"cost_usd"`
	Records          int     `json:"records"`
}

func (s *UsageStore) Summarize(ctx context.Context, tenantID string, from, to time.Time) (*Summary, error) {
	const q = `
		SELECT
			COALESCE(SUM(prompt_tokens), 0)::INT,
			COALESCE(SUM(completion_tokens), 0)::INT,
			COALESCE(SUM(cost_usd), 0)::FLOAT8,
			COUNT(*)::INT
		FROM usage_logs
		WHERE tenant_id = $1 AND ts >= $2 AND ts < $3`
	var sum Summary
	err := s.DB.Pool.QueryRow(ctx, q, tenantID, from, to).Scan(
		&sum.PromptTokens, &sum.CompletionTokens, &sum.CostUSD, &sum.Records,
	)
	if err != nil {
		return nil, err
	}
	sum.TotalTokens = sum.PromptTokens + sum.CompletionTokens
	return &sum, nil
}

// Recent returns the N most recent usage rows for a tenant.
func (s *UsageStore) Recent(ctx context.Context, tenantID string, limit int) ([]*UsageLog, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	const q = `
		SELECT id, tenant_id, ts, provider, model, prompt_tokens, completion_tokens, cost_usd
		FROM usage_logs
		WHERE tenant_id = $1
		ORDER BY ts DESC
		LIMIT $2`
	rows, err := s.DB.Pool.Query(ctx, q, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*UsageLog
	for rows.Next() {
		u := &UsageLog{}
		if err := rows.Scan(&u.ID, &u.TenantID, &u.Timestamp, &u.Provider, &u.Model,
			&u.PromptTokens, &u.CompletionTokens, &u.CostUSD); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// PlatformStats aggregates tenant counts and current-month usage across all non-deleted tenants.
type PlatformStats struct {
	ActiveTenants    int     `json:"active_tenants"`
	SuspendedTenants int     `json:"suspended_tenants"`
	ErrorTenants     int     `json:"error_tenants"`
	TotalCostUSD     float64 `json:"total_cost_usd"`
	TotalTokens      int64   `json:"total_tokens"`
}

func (s *UsageStore) PlatformSummary(ctx context.Context) (*PlatformStats, error) {
	const q = `
		SELECT
			COUNT(*) FILTER (WHERE t.status = 'active')    AS active,
			COUNT(*) FILTER (WHERE t.status = 'suspended') AS suspended,
			COUNT(*) FILTER (WHERE t.status = 'error')     AS error_count,
			COALESCE(SUM(u.cost_usd), 0)::FLOAT8           AS total_cost,
			COALESCE(SUM(u.prompt_tokens + u.completion_tokens), 0)::BIGINT AS total_tokens
		FROM tenants t
		LEFT JOIN usage_logs u ON u.tenant_id = t.id
			AND u.ts >= date_trunc('month', now())
		WHERE t.deleted_at IS NULL`
	var s2 PlatformStats
	err := s.DB.Pool.QueryRow(ctx, q).Scan(
		&s2.ActiveTenants, &s2.SuspendedTenants, &s2.ErrorTenants,
		&s2.TotalCostUSD, &s2.TotalTokens,
	)
	return &s2, err
}

// TimeseriesPoint is a daily cost aggregation.
type TimeseriesPoint struct {
	Day     string  `json:"day"`
	CostUSD float64 `json:"cost_usd"`
	Tokens  int64   `json:"tokens"`
}

func (s *UsageStore) Timeseries(ctx context.Context, days int) ([]TimeseriesPoint, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	const q = `
		SELECT
			to_char(date_trunc('day', u.ts), 'YYYY-MM-DD') AS day,
			COALESCE(SUM(u.cost_usd), 0)::FLOAT8           AS cost,
			COALESCE(SUM(u.prompt_tokens + u.completion_tokens), 0)::BIGINT AS tokens
		FROM usage_logs u
		JOIN tenants t ON t.id = u.tenant_id
		WHERE t.deleted_at IS NULL
		  AND u.ts >= now() - ($1 * interval '1 day')
		GROUP BY 1
		ORDER BY 1`
	rows, err := s.DB.Pool.Query(ctx, q, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TimeseriesPoint
	for rows.Next() {
		var p TimeseriesPoint
		if err := rows.Scan(&p.Day, &p.CostUSD, &p.Tokens); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// LastTimestamp returns the most recent ts seen for the tenant, or zero if none.
// Used by the poller to bound the next /spend/logs query.
func (s *UsageStore) LastTimestamp(ctx context.Context, tenantID string) (time.Time, error) {
	const q = `SELECT COALESCE(MAX(ts), 'epoch'::timestamptz) FROM usage_logs WHERE tenant_id = $1`
	var t time.Time
	err := s.DB.Pool.QueryRow(ctx, q, tenantID).Scan(&t)
	return t, err
}
