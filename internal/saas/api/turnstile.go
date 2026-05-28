package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultTurnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

var (
	turnstileVerifyURL  = defaultTurnstileVerifyURL
	turnstileHTTPClient = &http.Client{Timeout: 5 * time.Second}
)

type turnstileVerifyResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes,omitempty"`
}

func (h *Handler) verifyPublicChatTurnstile(w http.ResponseWriter, r *http.Request) bool {
	secret := strings.TrimSpace(h.Cfg.TurnstileSecretKey)
	if secret == "" {
		return true
	}
	token := strings.TrimSpace(r.Header.Get("X-Captcha-Token"))
	if token == "" {
		writeError(w, http.StatusForbidden, "captcha required")
		return false
	}
	ok, err := verifyTurnstileToken(r.Context(), turnstileHTTPClient, turnstileVerifyURL, secret, token, clientIP(r))
	if err != nil {
		log.Printf("turnstile verify failed: %v", err)
		writeError(w, http.StatusServiceUnavailable, "captcha indisponível, tente novamente")
		return false
	}
	if !ok {
		writeError(w, http.StatusForbidden, "captcha inválido")
		return false
	}
	return true
}

func verifyTurnstileToken(ctx context.Context, client *http.Client, endpoint, secret, token, remoteIP string) (bool, error) {
	secret = strings.TrimSpace(secret)
	token = strings.TrimSpace(token)
	if secret == "" {
		return true, nil
	}
	if token == "" {
		return false, nil
	}
	if client == nil {
		client = http.DefaultClient
	}
	if strings.TrimSpace(endpoint) == "" {
		endpoint = defaultTurnstileVerifyURL
	}

	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP = strings.TrimSpace(remoteIP); remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return false, fmt.Errorf("turnstile status %d", resp.StatusCode)
	}
	var out turnstileVerifyResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&out); err != nil {
		return false, err
	}
	if resp.StatusCode >= 400 {
		return false, fmt.Errorf("turnstile status %d: %s", resp.StatusCode, strings.Join(out.ErrorCodes, ","))
	}
	return out.Success, nil
}
