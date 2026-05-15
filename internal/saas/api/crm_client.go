package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// crmClient is a tiny HTTP client used by the controlplane (not the admin UI)
// to talk to the open-crm sidecar — e.g. auto-creating a Contact when a new
// tenant is provisioned. Distinct from the reverse proxy (`crm_proxy.go`),
// which serves admin browser traffic.
type crmClient struct {
	baseURL string
	http    *http.Client
}

func newCRMClient(baseURL string) *crmClient {
	return &crmClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

type crmContact struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
}

// CreateContact best-effort creates a contact in open-crm. Callers should
// treat failures as non-fatal — log and move on.
func (c *crmClient) CreateContact(ctx context.Context, firstName, lastName, email string) (*crmContact, error) {
	body, _ := json.Marshal(map[string]string{
		"first_name": firstName,
		"last_name":  lastName,
		"email":      email,
		"status":     "customer",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/contacts", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("opencrm: %d %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var out struct {
		Contact crmContact `json:"contact"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out.Contact, nil
}
