package api

import (
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// registerWhatsAppNativeRoutes binds WhatsApp native QR-pairing endpoints to the ServeMux.
// The launcher backend proxies these calls through to the gateway subprocess, which is the
// only component with live access to the whatsmeow client and its QR channel.
func (h *Handler) registerWhatsAppNativeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/whatsapp_native/qr", h.handleGetWhatsAppNativeQR)
	mux.HandleFunc("POST /api/whatsapp_native/disconnect", h.handlePostWhatsAppNativeDisconnect)
}

type whatsAppNativeQRResponse struct {
	Status      string `json:"status"`
	QRDataURI   string `json:"qr_data_uri,omitempty"`
	PhoneNumber string `json:"phone_number,omitempty"`
	Error       string `json:"error,omitempty"`
	UpdatedAt   int64  `json:"updated_at,omitempty"`
	ExpiresAt   int64  `json:"expires_at,omitempty"`
}

// handlePostWhatsAppNativeDisconnect logs out the current WhatsApp session via the gateway.
//
//	POST /api/whatsapp_native/disconnect
func (h *Handler) handlePostWhatsAppNativeDisconnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	target := h.gatewayProxyURL()
	target.Path = "/whatsapp_native/disconnect"

	gatewayStatus, _ := h.gatewayStatusData()["gateway_status"].(string)

	if gatewayStatus != "running" {
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "gateway is not running"})
		return
	}

	client := http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target.String(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to reach gateway: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

// handleGetWhatsAppNativeQR returns the current pairing state of the WhatsApp native channel.
//
//	GET /api/whatsapp_native/qr
func (h *Handler) handleGetWhatsAppNativeQR(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	target := h.gatewayProxyURL()
	target.Path = "/whatsapp_native/qr"

	gatewayStatus, _ := h.gatewayStatusData()["gateway_status"].(string)

	if gatewayStatus != "running" {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "offline",
			Error:  "gateway is not running",
		})
		return
	}

	client := http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "offline",
			Error:  "failed to reach gateway: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "disabled",
			Error:  "whatsapp_native channel is not enabled",
		})
		return
	}

	if resp.StatusCode != http.StatusOK {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "error",
			Error:  "gateway returned " + resp.Status,
		})
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	var parsed whatsAppNativeQRResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		_ = json.NewEncoder(w).Encode(whatsAppNativeQRResponse{
			Status: "error",
			Error:  "invalid gateway response",
		})
		return
	}

	_ = json.NewEncoder(w).Encode(parsed)
}
