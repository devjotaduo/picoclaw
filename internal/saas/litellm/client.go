// Package litellm is a thin HTTP client for the LiteLLM Proxy admin API.
// Docs: https://docs.litellm.ai/docs/proxy/virtual_keys
package litellm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	masterKey  string
	httpClient *http.Client
}

func NewClient(baseURL, masterKey string) *Client {
	return &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		masterKey: masterKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GenerateKeyInput configures a new virtual key. UserID and KeyAlias are both
// set to the tenant id so we can look up either way later. MonthlyBudgetUSD,
// when non-nil, enforces a 30-day rolling budget at LiteLLM and bounces requests
// past it with HTTP 429.
type GenerateKeyInput struct {
	TenantID         string
	MonthlyBudgetUSD *float64
	Models           []string // restrict allowed models; nil = all configured
}

type GenerateKeyOutput struct {
	Key      string // plaintext virtual key — surfaces only here, never persisted
	KeyName  string // LiteLLM-side identifier for later delete/info
	UserID   string
	KeyAlias string
}

type generateKeyReq struct {
	UserID         string                 `json:"user_id"`
	KeyAlias       string                 `json:"key_alias"`
	MaxBudget      *float64               `json:"max_budget,omitempty"`
	BudgetDuration string                 `json:"budget_duration,omitempty"`
	Models         []string               `json:"models,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

type generateKeyResp struct {
	Key      string `json:"key"`
	KeyName  string `json:"key_name"`
	UserID   string `json:"user_id"`
	KeyAlias string `json:"key_alias"`
}

func (c *Client) GenerateKey(ctx context.Context, in GenerateKeyInput) (*GenerateKeyOutput, error) {
	body := generateKeyReq{
		UserID:   in.TenantID,
		KeyAlias: in.TenantID,
		Models:   in.Models,
		Metadata: map[string]interface{}{"tenant_id": in.TenantID},
	}
	if in.MonthlyBudgetUSD != nil {
		body.MaxBudget = in.MonthlyBudgetUSD
		body.BudgetDuration = "30d"
	}

	var resp generateKeyResp
	if err := c.do(ctx, http.MethodPost, "/key/generate", body, &resp); err != nil {
		return nil, err
	}
	if resp.Key == "" {
		return nil, errors.New("litellm: empty key returned")
	}
	return &GenerateKeyOutput{
		Key:      resp.Key,
		KeyName:  resp.KeyName,
		UserID:   resp.UserID,
		KeyAlias: resp.KeyAlias,
	}, nil
}

// DeleteKey removes the virtual key identified by its key_alias (we always set
// alias = tenant_id). LiteLLM accepts an alias-based delete which avoids ever
// needing the plaintext key.
func (c *Client) DeleteKey(ctx context.Context, tenantID string) error {
	body := map[string]interface{}{"key_aliases": []string{tenantID}}
	return c.do(ctx, http.MethodPost, "/key/delete", body, nil)
}

// SpendRecord is one row from /spend/logs.
type SpendRecord struct {
	RequestID        string    `json:"request_id"`
	UserID           string    `json:"user_id"`
	StartTime        time.Time `json:"startTime"`
	EndTime          time.Time `json:"endTime"`
	Model            string    `json:"model"`
	Provider         string    `json:"custom_llm_provider"`
	Spend            float64   `json:"spend"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
}

// GetSpendLogs returns recent spend events for a tenant. Pass since=time.Time{}
// to get everything LiteLLM still has.
func (c *Client) GetSpendLogs(ctx context.Context, tenantID string, since time.Time) ([]SpendRecord, error) {
	q := url.Values{}
	q.Set("user_id", tenantID)
	if !since.IsZero() {
		q.Set("start_date", since.UTC().Format("2006-01-02"))
	}
	path := "/spend/logs?" + q.Encode()
	var out []SpendRecord
	if err := c.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return fmt.Errorf("marshal: %w", err)
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.masterKey)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("litellm %s %s: status %d: %s",
			method, path, resp.StatusCode, truncate(string(respBody), 300))
	}
	if out == nil || len(respBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("decode: %w (body=%q)", err, truncate(string(respBody), 300))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "...(+" + strconv.Itoa(len(s)-n) + ")"
}
