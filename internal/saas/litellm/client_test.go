package litellm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGenerateKey(t *testing.T) {
	var capturedAuth string
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/key/generate" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		capturedAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &capturedBody)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"key":       "sk-virtual-abc123",
			"key_name":  "sk-virtual-abc123",
			"user_id":   "alice-7f3a2c",
			"key_alias": "alice-7f3a2c",
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "sk-master-test")
	budget := 5.0
	out, err := c.GenerateKey(context.Background(), GenerateKeyInput{
		TenantID:         "alice-7f3a2c",
		MonthlyBudgetUSD: &budget,
	})
	if err != nil {
		t.Fatal(err)
	}
	if capturedAuth != "Bearer sk-master-test" {
		t.Errorf("auth header wrong: %q", capturedAuth)
	}
	if capturedBody["user_id"] != "alice-7f3a2c" {
		t.Errorf("user_id wrong: %v", capturedBody["user_id"])
	}
	if capturedBody["key_alias"] != "alice-7f3a2c" {
		t.Errorf("key_alias wrong: %v", capturedBody["key_alias"])
	}
	if capturedBody["max_budget"].(float64) != 5.0 {
		t.Errorf("max_budget wrong: %v", capturedBody["max_budget"])
	}
	if capturedBody["budget_duration"] != "30d" {
		t.Errorf("budget_duration wrong: %v", capturedBody["budget_duration"])
	}
	meta, _ := capturedBody["metadata"].(map[string]any)
	if meta["tenant_id"] != "alice-7f3a2c" {
		t.Errorf("metadata.tenant_id wrong: %v", meta["tenant_id"])
	}
	if out.Key != "sk-virtual-abc123" {
		t.Errorf("key wrong: %q", out.Key)
	}
}

func TestGenerateKey_NoBudget(t *testing.T) {
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &capturedBody)
		_ = json.NewEncoder(w).Encode(map[string]string{"key": "sk-x"})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	_, err := c.GenerateKey(context.Background(), GenerateKeyInput{TenantID: "bob"})
	if err != nil {
		t.Fatal(err)
	}
	if _, present := capturedBody["max_budget"]; present {
		t.Errorf("max_budget should be omitted when nil, got %v", capturedBody["max_budget"])
	}
	if _, present := capturedBody["budget_duration"]; present {
		t.Errorf("budget_duration should be omitted when no budget, got %v", capturedBody["budget_duration"])
	}
}

func TestDeleteKey(t *testing.T) {
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/key/delete" {
			t.Errorf("path: %s", r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	if err := c.DeleteKey(context.Background(), "alice-7f3a2c"); err != nil {
		t.Fatal(err)
	}
	aliases := capturedBody["key_aliases"].([]any)
	if len(aliases) != 1 || aliases[0] != "alice-7f3a2c" {
		t.Errorf("key_aliases wrong: %v", aliases)
	}
}

func TestListModels(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/model/info" {
			t.Errorf("path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{
					"model_name": "gpt-4o-mini",
					"litellm_params": map[string]any{
						"model":               "openai/gpt-4o-mini",
						"custom_llm_provider": "openai",
					},
					"model_info": map[string]any{
						"id":       "model-id-1",
						"mode":     "chat",
						"db_model": true,
					},
				},
			},
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	models, err := c.ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 {
		t.Fatalf("want 1 model, got %d", len(models))
	}
	got := models[0]
	if got.ID != "model-id-1" || got.ModelName != "gpt-4o-mini" ||
		got.Model != "openai/gpt-4o-mini" || got.Provider != "openai" ||
		got.Mode != "chat" || !got.DBModel {
		t.Fatalf("unexpected model info: %+v", got)
	}
}

func TestAddModel(t *testing.T) {
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/model/new" {
			t.Errorf("path: %s", r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	rpm := 30
	if err := c.AddModel(context.Background(), AddModelInput{
		ModelName:         "sonnet",
		Model:             "anthropic/claude-sonnet-4-5",
		APIKey:            "os.environ/ANTHROPIC_API_KEY",
		APIBase:           "https://api.anthropic.com",
		CustomLLMProvider: "anthropic",
		RPM:               &rpm,
	}); err != nil {
		t.Fatal(err)
	}
	if capturedBody["model_name"] != "sonnet" {
		t.Fatalf("model_name wrong: %#v", capturedBody)
	}
	params := capturedBody["litellm_params"].(map[string]any)
	if params["model"] != "anthropic/claude-sonnet-4-5" ||
		params["api_key"] != "os.environ/ANTHROPIC_API_KEY" ||
		params["api_base"] != "https://api.anthropic.com" ||
		params["custom_llm_provider"] != "anthropic" ||
		params["rpm"].(float64) != 30 {
		t.Fatalf("litellm_params wrong: %#v", params)
	}
}

func TestDeleteModel(t *testing.T) {
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/model/delete" {
			t.Errorf("path: %s", r.URL.Path)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &capturedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	if err := c.DeleteModel(context.Background(), "model-id-1"); err != nil {
		t.Fatal(err)
	}
	if capturedBody["id"] != "model-id-1" {
		t.Fatalf("delete body wrong: %#v", capturedBody)
	}
}

func TestTestConnectionHitsModelsEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-master-test" {
			t.Errorf("Authorization = %q", got)
		}
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "sk-master-test")
	if err := c.TestConnection(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestGetSpendLogs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/spend/logs" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("user_id") != "alice" {
			t.Errorf("missing user_id filter")
		}
		_, _ = w.Write([]byte(`[
			{
				"request_id":"r1",
				"user_id":"alice",
				"startTime":"2026-05-14T12:00:00Z",
				"endTime":"2026-05-14T12:00:02Z",
				"model":"gpt-4o-mini",
				"custom_llm_provider":"openai",
				"spend":0.0015,
				"prompt_tokens":100,
				"completion_tokens":50
			}
		]`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "k")
	logs, err := c.GetSpendLogs(context.Background(), "alice", time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 1 {
		t.Fatalf("want 1 log, got %d", len(logs))
	}
	if logs[0].PromptTokens != 100 || logs[0].CompletionTokens != 50 {
		t.Errorf("token counts wrong: %+v", logs[0])
	}
	if logs[0].Spend != 0.0015 {
		t.Errorf("spend wrong: %v", logs[0].Spend)
	}
}

func TestErrorResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"bad master key"}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "wrong")
	err := c.DeleteKey(context.Background(), "alice")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "status 403") {
		t.Errorf("error should mention status: %v", err)
	}
}
