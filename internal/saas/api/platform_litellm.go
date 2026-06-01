package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/mcp"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type platformLiteLLMOut struct {
	URL                  string `json:"url"`
	Configured           bool   `json:"configured"`
	URLSource            string `json:"url_source"`
	MasterKeyConfigured  bool   `json:"master_key_configured"`
	MasterKeySource      string `json:"master_key_source"`
	EncryptionConfigured bool   `json:"encryption_configured"`
}

type platformLiteLLMReq struct {
	URL       string `json:"url"`
	MasterKey string `json:"master_key"`
}

type platformLiteLLMModelsOut struct {
	Models []litellm.ModelInfo `json:"models"`
}

type platformLiteLLMModelReq struct {
	ModelName         string `json:"model_name"`
	Model             string `json:"model"`
	APIKey            string `json:"api_key,omitempty"`
	APIBase           string `json:"api_base,omitempty"`
	APIVersion        string `json:"api_version,omitempty"`
	CustomLLMProvider string `json:"custom_llm_provider,omitempty"`
	RPM               *int   `json:"rpm,omitempty"`
	TPM               *int   `json:"tpm,omitempty"`
}

func normalizePlatformLiteLLMModelReq(req platformLiteLLMModelReq) platformLiteLLMModelReq {
	req.ModelName = strings.TrimSpace(req.ModelName)
	req.Model = strings.TrimSpace(req.Model)
	req.APIKey = strings.TrimSpace(req.APIKey)
	req.APIBase = strings.TrimSpace(req.APIBase)
	req.APIVersion = strings.TrimSpace(req.APIVersion)
	req.CustomLLMProvider = normalizePlatformLiteLLMProvider(req.CustomLLMProvider, req.Model)
	req.Model = normalizePlatformLiteLLMModel(req.Model, req.CustomLLMProvider)
	return req
}

func normalizePlatformLiteLLMProvider(provider, model string) string {
	provider = strings.TrimSpace(strings.ToLower(provider))
	switch provider {
	case "google", "google-ai", "google-ai-studio", "ai-studio":
		return "gemini"
	case "vertex", "vertexai":
		return "vertex_ai"
	case "":
		model = strings.TrimSpace(strings.ToLower(model))
		switch {
		case strings.HasPrefix(model, "gemini/"), strings.HasPrefix(model, "gemini-"):
			return "gemini"
		case strings.HasPrefix(model, "openrouter/"):
			return "openrouter"
		case strings.HasPrefix(model, "openai/"):
			return "openai"
		case strings.HasPrefix(model, "anthropic/"):
			return "anthropic"
		default:
			return ""
		}
	default:
		return provider
	}
}

func normalizePlatformLiteLLMModel(model, provider string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return ""
	}
	if provider == "gemini" && !strings.Contains(model, "/") {
		return "gemini/" + model
	}
	return model
}

type effectiveLiteLLMConfig struct {
	URL       string
	MasterKey string
	Source    string
}

func resolveSaaSSecretsEncryptionKey(cfg *config.Config) ([]byte, error) {
	return ResolveSaaSSecretsEncryptionKey(cfg)
}

func ResolveSaaSSecretsEncryptionKey(cfg *config.Config) ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv("PICOCLAW_SAAS_SECRETS_ENCRYPTION_KEY"))
	if raw == "" {
		if cfg == nil {
			return nil, nil
		}
		raw = strings.TrimSpace(cfg.MCPEncryptionKey)
	}
	if raw == "" {
		return nil, nil
	}
	return mcp.LoadEncryptionKey(raw)
}

func encryptPlatformSecret(secret string, key []byte) (string, error) {
	return mcp.EncryptCredentials(map[string]string{"value": secret}, key)
}

func decryptPlatformSecret(blob string, key []byte) (string, error) {
	creds, err := mcp.DecryptCredentials(blob, key)
	if err != nil {
		return "", err
	}
	return creds["value"], nil
}

func LoadEffectiveLiteLLMConfig(
	ctx context.Context,
	cfg *config.Config,
	settings *store.PlatformSettingsStore,
	secretsKey []byte,
) (effectiveLiteLLMConfig, error) {
	out := effectiveLiteLLMConfig{}
	if cfg != nil {
		out.URL = strings.TrimSpace(cfg.LiteLLMURL)
		out.MasterKey = strings.TrimSpace(cfg.LiteLLMMasterKey)
		if out.URL != "" || out.MasterKey != "" {
			out.Source = "env"
		}
	}
	if settings == nil {
		return out, nil
	}
	urlRow, err := settings.GetOptional(ctx, store.PlatformSettingLiteLLMURL)
	if err != nil {
		return out, err
	}
	masterRow, err := settings.GetOptional(ctx, store.PlatformSettingLiteLLMMasterKey)
	if err != nil {
		return out, err
	}
	if urlRow != nil {
		out.URL = strings.TrimSpace(urlRow.Value)
		out.Source = "database"
	}
	if masterRow != nil && strings.TrimSpace(masterRow.Value) != "" {
		if len(secretsKey) == 0 {
			return out, errors.New("platform secret encryption key is not configured")
		}
		plain, err := decryptPlatformSecret(masterRow.Value, secretsKey)
		if err != nil {
			return out, err
		}
		out.MasterKey = strings.TrimSpace(plain)
		out.Source = "database"
	}
	return out, nil
}

func (h *Handler) handleGetPlatformLiteLLM(w http.ResponseWriter, r *http.Request) {
	out, err := h.platformLiteLLMStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handlePutPlatformLiteLLM(w http.ResponseWriter, r *http.Request) {
	if h.Platform == nil {
		writeError(w, http.StatusServiceUnavailable, "platform settings store not configured")
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	var req platformLiteLLMReq
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	url := strings.TrimSpace(req.URL)
	if strings.TrimSpace(req.MasterKey) != "" {
		if len(h.SecretsEncKey) == 0 {
			writeError(
				w,
				http.StatusServiceUnavailable,
				"PICOCLAW_SAAS_SECRETS_ENCRYPTION_KEY or PICOCLAW_SAAS_MCP_ENCRYPTION_KEY is required to store secrets",
			)
			return
		}
	}
	if err := h.Platform.Upsert(r.Context(), store.PlatformSettingLiteLLMURL, url, false); err != nil {
		log.Printf("ERROR platform_litellm: save url: %v", err)
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if strings.TrimSpace(req.MasterKey) != "" {
		ciphertext, err := encryptPlatformSecret(strings.TrimSpace(req.MasterKey), h.SecretsEncKey)
		if err != nil {
			log.Printf("ERROR platform_litellm: encrypt master key: %v", err)
			writeError(w, http.StatusInternalServerError, "encrypt error")
			return
		}
		if err := h.Platform.Upsert(r.Context(), store.PlatformSettingLiteLLMMasterKey, ciphertext, true); err != nil {
			log.Printf("ERROR platform_litellm: save master key: %v", err)
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}

	effective, err := LoadEffectiveLiteLLMConfig(r.Context(), h.Cfg, h.Platform, h.SecretsEncKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.applyRuntimeLiteLLMConfig(effective)
	out, err := h.platformLiteLLMStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handleTestPlatformLiteLLM(w http.ResponseWriter, r *http.Request) {
	effective, err := LoadEffectiveLiteLLMConfig(r.Context(), h.Cfg, h.Platform, h.SecretsEncKey)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if strings.TrimSpace(effective.URL) == "" || strings.TrimSpace(effective.MasterKey) == "" {
		writeError(w, http.StatusServiceUnavailable, "LiteLLM is not configured")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err := litellm.NewClient(effective.URL, effective.MasterKey).TestConnection(ctx); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleListPlatformLiteLLMModels(w http.ResponseWriter, r *http.Request) {
	client, ok := h.platformLiteLLMClient(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	models, err := client.ListModels(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, platformLiteLLMModelsOut{Models: models})
}

func (h *Handler) handleCreatePlatformLiteLLMModel(w http.ResponseWriter, r *http.Request) {
	client, ok := h.platformLiteLLMClient(w, r)
	if !ok {
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	var req platformLiteLLMModelReq
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req = normalizePlatformLiteLLMModelReq(req)
	if strings.TrimSpace(req.ModelName) == "" {
		writeError(w, http.StatusBadRequest, "model_name is required")
		return
	}
	if strings.TrimSpace(req.Model) == "" {
		writeError(w, http.StatusBadRequest, "model is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := client.AddModel(ctx, litellm.AddModelInput{
		ModelName:         req.ModelName,
		Model:             req.Model,
		APIKey:            req.APIKey,
		APIBase:           req.APIBase,
		APIVersion:        req.APIVersion,
		CustomLLMProvider: req.CustomLLMProvider,
		RPM:               req.RPM,
		TPM:               req.TPM,
	}); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true})
}

func (h *Handler) handleDeletePlatformLiteLLMModel(w http.ResponseWriter, r *http.Request) {
	client, ok := h.platformLiteLLMClient(w, r)
	if !ok {
		return
	}
	modelID := chi.URLParam(r, "modelID")
	if strings.TrimSpace(modelID) == "" {
		writeError(w, http.StatusBadRequest, "model id is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := client.DeleteModel(ctx, modelID); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) platformLiteLLMStatus(ctx context.Context) (platformLiteLLMOut, error) {
	out := platformLiteLLMOut{EncryptionConfigured: len(h.SecretsEncKey) > 0}
	if h.Cfg != nil {
		out.URL = strings.TrimSpace(h.Cfg.LiteLLMURL)
		if out.URL != "" {
			out.URLSource = "env"
		}
		if strings.TrimSpace(h.Cfg.LiteLLMMasterKey) != "" {
			out.MasterKeyConfigured = true
			out.MasterKeySource = "env"
		}
	}
	if h.Platform != nil {
		urlRow, err := h.Platform.GetOptional(ctx, store.PlatformSettingLiteLLMURL)
		if err != nil {
			return out, err
		}
		if urlRow != nil {
			out.URL = strings.TrimSpace(urlRow.Value)
			out.URLSource = "database"
		}
		masterRow, err := h.Platform.GetOptional(ctx, store.PlatformSettingLiteLLMMasterKey)
		if err != nil {
			return out, err
		}
		if masterRow != nil && strings.TrimSpace(masterRow.Value) != "" {
			out.MasterKeyConfigured = true
			out.MasterKeySource = "database"
		}
	}
	if out.URLSource == "" {
		out.URLSource = "none"
	}
	if out.MasterKeySource == "" {
		out.MasterKeySource = "none"
	}
	out.Configured = strings.TrimSpace(out.URL) != "" && out.MasterKeyConfigured
	return out, nil
}

func (h *Handler) platformLiteLLMClient(w http.ResponseWriter, r *http.Request) (*litellm.Client, bool) {
	effective, err := LoadEffectiveLiteLLMConfig(r.Context(), h.Cfg, h.Platform, h.SecretsEncKey)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return nil, false
	}
	if strings.TrimSpace(effective.URL) == "" || strings.TrimSpace(effective.MasterKey) == "" {
		writeError(w, http.StatusServiceUnavailable, "LiteLLM is not configured")
		return nil, false
	}
	return litellm.NewClient(effective.URL, effective.MasterKey), true
}

func (h *Handler) applyRuntimeLiteLLMConfig(cfg effectiveLiteLLMConfig) {
	if h.Cfg != nil {
		h.Cfg.LiteLLMURL = cfg.URL
		h.Cfg.LiteLLMMasterKey = cfg.MasterKey
	}
	if h.Provisioner == nil {
		return
	}
	if h.Provisioner.Cfg != nil {
		h.Provisioner.Cfg.LiteLLMURL = cfg.URL
		h.Provisioner.Cfg.LiteLLMMasterKey = cfg.MasterKey
	}
	if strings.TrimSpace(cfg.URL) == "" || strings.TrimSpace(cfg.MasterKey) == "" {
		h.Provisioner.LiteLLM = nil
		return
	}
	h.Provisioner.LiteLLM = litellm.NewClient(cfg.URL, cfg.MasterKey)
}
