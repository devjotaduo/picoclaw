package tools

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/orchestrator"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/media"
)

func TestGenerateImageToolMarketingCreatesInstagramImageFile(t *testing.T) {
	const imageB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

	var sawRequest bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/images/generations" {
			t.Fatalf("path = %s, want /images/generations", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-image-key" {
			t.Fatalf("Authorization = %q, want bearer key", got)
		}

		var payload struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
			Size   string `json:"size"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if payload.Model != "gpt-image-1" {
			t.Fatalf("model = %q, want gpt-image-1", payload.Model)
		}
		if !strings.Contains(payload.Prompt, "Instagram") {
			t.Fatalf("prompt = %q, want Instagram prompt", payload.Prompt)
		}
		if payload.Size != "1024x1024" {
			t.Fatalf("size = %q, want 1024x1024", payload.Size)
		}

		sawRequest = true
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{{"b64_json": imageB64}},
		})
	}))
	t.Cleanup(provider.Close)

	apiKey := config.NewSecureString("test-image-key")
	workspace := t.TempDir()
	tool := NewGenerateImageTool(workspace, config.ImageGenerationToolsConfig{
		ToolConfig: config.ToolConfig{Enabled: true},
		APIBase:    provider.URL,
		APIKey:     *apiKey,
		Model:      "gpt-image-1",
		Size:       "1024x1024",
	})

	ctx := WithToolSessionContext(context.Background(), orchestrator.AgentMarketing, "marketing:test", nil)
	result := tool.Execute(ctx, map[string]any{
		"prompt": "Crie um post quadrado para Instagram sobre teste de campanha.",
		"name":   "post instagram teste",
	})

	if result.IsError {
		t.Fatalf("expected generated image, got error: %s", result.ForLLM)
	}
	if !sawRequest {
		t.Fatal("expected image provider request")
	}
	if !strings.Contains(result.ForLLM, "Image generated and saved:") {
		t.Fatalf("result = %q, want saved image message", result.ForLLM)
	}

	path := filepath.Join(workspace, "assets", "images", "post_instagram_teste.png")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read generated image: %v", err)
	}
	want, err := base64.StdEncoding.DecodeString(imageB64)
	if err != nil {
		t.Fatalf("decode fixture image: %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("generated image bytes differ")
	}
}

func TestGenerateImageToolMarketingCreatesOpenRouterInstagramImageFile(t *testing.T) {
	const imageB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

	var sawRequest bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/chat/completions" {
			t.Fatalf("path = %s, want /chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-openrouter-key" {
			t.Fatalf("Authorization = %q, want bearer key", got)
		}

		var payload struct {
			Model       string         `json:"model"`
			Messages    []messageShape `json:"messages"`
			Modalities  []string       `json:"modalities"`
			ImageConfig map[string]any `json:"image_config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if payload.Model != "google/gemini-2.5-flash-image" {
			t.Fatalf("model = %q, want OpenRouter image model", payload.Model)
		}
		if len(payload.Messages) != 1 || !strings.Contains(payload.Messages[0].Content, "Instagram") {
			t.Fatalf("messages = %+v, want Instagram prompt", payload.Messages)
		}
		if len(payload.Modalities) != 2 || payload.Modalities[0] != "image" || payload.Modalities[1] != "text" {
			t.Fatalf("modalities = %+v, want [image text]", payload.Modalities)
		}
		if payload.ImageConfig["aspect_ratio"] != "4:5" {
			t.Fatalf("image_config = %+v, want 4:5 aspect ratio", payload.ImageConfig)
		}

		sawRequest = true
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]any{
						"images": []map[string]any{
							{
								"type": "image_url",
								"image_url": map[string]string{
									"url": "data:image/png;base64," + imageB64,
								},
							},
						},
					},
				},
			},
		})
	}))
	t.Cleanup(provider.Close)

	apiKey := config.NewSecureString("test-openrouter-key")
	workspace := t.TempDir()
	tool := NewGenerateImageTool(workspace, config.ImageGenerationToolsConfig{
		ToolConfig: config.ToolConfig{Enabled: true},
		APIBase:    provider.URL,
		APIKey:     *apiKey,
		Model:      "google/gemini-2.5-flash-image",
		Size:       "1080x1350",
	})

	ctx := WithToolSessionContext(context.Background(), orchestrator.AgentMarketing, "marketing:test", nil)
	result := tool.Execute(ctx, map[string]any{
		"prompt": "Crie um post vertical para Instagram sobre teste de campanha.",
		"name":   "post instagram openrouter",
	})

	if result.IsError {
		t.Fatalf("expected generated image, got error: %s", result.ForLLM)
	}
	if !sawRequest {
		t.Fatal("expected image provider request")
	}

	path := filepath.Join(workspace, "assets", "images", "post_instagram_openrouter.png")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read generated image: %v", err)
	}
	want, err := base64.StdEncoding.DecodeString(imageB64)
	if err != nil {
		t.Fatalf("decode fixture image: %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("generated image bytes differ")
	}
}

func TestGenerateImageToolRegistersGeneratedImageForChatDelivery(t *testing.T) {
	const imageB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{{"b64_json": imageB64}},
		})
	}))
	t.Cleanup(provider.Close)

	apiKey := config.NewSecureString("test-image-key")
	store := media.NewFileMediaStore()
	workspace := t.TempDir()
	tool := NewGenerateImageTool(workspace, config.ImageGenerationToolsConfig{
		ToolConfig: config.ToolConfig{Enabled: true},
		APIBase:    provider.URL,
		APIKey:     *apiKey,
		Model:      "gpt-image-1",
		Size:       "1024x1024",
	})
	tool.SetMediaStore(store)

	ctx := WithToolContext(context.Background(), "panel", "chat1")
	ctx = WithToolSessionContext(ctx, orchestrator.AgentMarketing, "marketing:test", nil)
	result := tool.Execute(ctx, map[string]any{
		"prompt": "Crie um post quadrado para Instagram.",
		"name":   "post entregavel",
	})

	if result.IsError {
		t.Fatalf("expected generated image, got error: %s", result.ForLLM)
	}
	if !result.DeliverMedia {
		t.Fatal("expected generated image to be marked for chat delivery")
	}
	if len(result.Media) != 1 {
		t.Fatalf("media refs = %+v, want one ref", result.Media)
	}
	path, meta, err := store.ResolveWithMeta(result.Media[0])
	if err != nil {
		t.Fatalf("ResolveWithMeta failed: %v", err)
	}
	if filepath.Base(path) != "post_entregavel.png" {
		t.Fatalf("stored path = %q, want generated image path", path)
	}
	if meta.ContentType != "image/png" {
		t.Fatalf("ContentType = %q, want image/png", meta.ContentType)
	}
	if meta.Source != "tool:generate_image" {
		t.Fatalf("Source = %q, want tool:generate_image", meta.Source)
	}
}

type messageShape struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func TestSaveMarketingProposalToolMarketingPersistsInstagramPostAssets(t *testing.T) {
	workspace := t.TempDir()
	tool := NewSaveMarketingProposalTool(workspace)
	ctx := WithToolSessionContext(context.Background(), orchestrator.AgentMarketing, "marketing:test", nil)

	result := tool.Execute(ctx, map[string]any{
		"title":       "Post Instagram Teste",
		"kind":        "post",
		"content":     "Legenda e direcionamento visual do post.",
		"asset_paths": []any{"assets/images/post_instagram_teste.png"},
	})
	if result.IsError {
		t.Fatalf("expected proposal save, got error: %s", result.ForLLM)
	}

	entries, err := os.ReadDir(filepath.Join(workspace, "proposals"))
	if err != nil {
		t.Fatalf("read proposals dir: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("proposal files = %d, want 1", len(entries))
	}

	data, err := os.ReadFile(filepath.Join(workspace, "proposals", entries[0].Name()))
	if err != nil {
		t.Fatalf("read proposal: %v", err)
	}
	var saved struct {
		Title      string   `json:"title"`
		Kind       string   `json:"kind"`
		Content    string   `json:"content"`
		AssetPaths []string `json:"asset_paths"`
		AgentID    string   `json:"agent_id"`
	}
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("decode proposal: %v", err)
	}
	if saved.Title != "Post Instagram Teste" || saved.Kind != "post" || saved.AgentID != orchestrator.AgentMarketing {
		t.Fatalf("saved proposal metadata = %+v", saved)
	}
	if len(saved.AssetPaths) != 1 || saved.AssetPaths[0] != "assets/images/post_instagram_teste.png" {
		t.Fatalf("asset_paths = %+v, want generated image path", saved.AssetPaths)
	}
	if !strings.Contains(saved.Content, "Legenda") {
		t.Fatalf("content = %q, want saved post content", saved.Content)
	}
}
