package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrTenantModelRoutingNotFound = errors.New("tenant model routing not found")

type TenantModelRouting struct {
	TenantID             string
	Mode                 string
	LiteLLMModelName     string
	LiteLLMAPIBase       string
	LiteLLMFallbacks     []string
	LiteLLMAllowedModels []string
	CLIOrder             []string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type TenantModelRoutingStore struct{ DB *DB }

func (s *TenantModelRoutingStore) Upsert(ctx context.Context, routing *TenantModelRouting) error {
	if routing == nil {
		return fmt.Errorf("tenant model routing is nil")
	}
	fallbacks, err := json.Marshal(nonNilStrings(routing.LiteLLMFallbacks))
	if err != nil {
		return fmt.Errorf("marshal litellm_fallbacks: %w", err)
	}
	allowed, err := json.Marshal(nonNilStrings(routing.LiteLLMAllowedModels))
	if err != nil {
		return fmt.Errorf("marshal litellm_allowed_models: %w", err)
	}
	order, err := json.Marshal(nonNilStrings(routing.CLIOrder))
	if err != nil {
		return fmt.Errorf("marshal cli_order: %w", err)
	}
	const q = `
        INSERT INTO tenant_model_routing (
            tenant_id, mode, litellm_model_name, litellm_api_base,
            litellm_fallbacks, litellm_allowed_models, cli_order,
            created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, now(), now())
        ON CONFLICT (tenant_id) DO UPDATE
        SET mode = EXCLUDED.mode,
            litellm_model_name = EXCLUDED.litellm_model_name,
            litellm_api_base = EXCLUDED.litellm_api_base,
            litellm_fallbacks = EXCLUDED.litellm_fallbacks,
            litellm_allowed_models = EXCLUDED.litellm_allowed_models,
            cli_order = EXCLUDED.cli_order,
            updated_at = now()`
	_, err = s.DB.Pool.Exec(ctx, q,
		routing.TenantID,
		routing.Mode,
		routing.LiteLLMModelName,
		routing.LiteLLMAPIBase,
		string(fallbacks),
		string(allowed),
		string(order),
	)
	return err
}

func (s *TenantModelRoutingStore) Get(ctx context.Context, tenantID string) (*TenantModelRouting, error) {
	const q = `
        SELECT tenant_id, mode, litellm_model_name, litellm_api_base,
               litellm_fallbacks::text, litellm_allowed_models::text, cli_order::text,
               created_at, updated_at
        FROM tenant_model_routing
        WHERE tenant_id = $1`
	var out TenantModelRouting
	var fallbacks, allowed, order string
	if err := s.DB.Pool.QueryRow(ctx, q, tenantID).Scan(
		&out.TenantID, &out.Mode, &out.LiteLLMModelName, &out.LiteLLMAPIBase,
		&fallbacks, &allowed, &order, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTenantModelRoutingNotFound
		}
		return nil, err
	}
	if err := json.Unmarshal([]byte(fallbacks), &out.LiteLLMFallbacks); err != nil {
		return nil, fmt.Errorf("decode litellm_fallbacks: %w", err)
	}
	if err := json.Unmarshal([]byte(allowed), &out.LiteLLMAllowedModels); err != nil {
		return nil, fmt.Errorf("decode litellm_allowed_models: %w", err)
	}
	if err := json.Unmarshal([]byte(order), &out.CLIOrder); err != nil {
		return nil, fmt.Errorf("decode cli_order: %w", err)
	}
	return &out, nil
}

func (s *TenantModelRoutingStore) GetOptional(ctx context.Context, tenantID string) (*TenantModelRouting, error) {
	out, err := s.Get(ctx, tenantID)
	if errors.Is(err, ErrTenantModelRoutingNotFound) {
		return nil, nil
	}
	return out, err
}

func nonNilStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}
