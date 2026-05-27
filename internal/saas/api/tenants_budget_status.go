package api

import (
	"context"
	"net/http"
	"sort"
	"time"
)

// budgetStatusEntry is one row in the /admin/tenants/budget-status
// response. Sorted by percent_used desc so the operator's eye lands on
// the most at-risk tenants first.
type budgetStatusEntry struct {
	TenantID     string  `json:"tenant_id"`
	Subdomain    string  `json:"subdomain"`
	DisplayName  string  `json:"display_name"`
	IsPublic     bool    `json:"is_public"`
	BudgetUSD    float64 `json:"budget_usd"`
	SpendMTDUSD  float64 `json:"spend_mtd_usd"`
	PercentUsed  float64 `json:"percent_used"`
	Severity     string  `json:"severity"` // ok | warn | critical | over
	SpendError   string  `json:"spend_error,omitempty"`
}

// budgetSeverity categorizes percent_used into operator-friendly bands.
// Thresholds chosen to match common alerting practice — 75% gives time
// to either raise the cap or investigate runaway usage before the
// LiteLLM hard cap kicks in and tenant chat starts 429'ing.
func budgetSeverity(percent float64) string {
	switch {
	case percent >= 100:
		return "over"
	case percent >= 90:
		return "critical"
	case percent >= 75:
		return "warn"
	default:
		return "ok"
	}
}

// handleAdminTenantsBudgetStatus serves GET /api/v1/admin/tenants/budget-status.
// Lists every active tenant with a MonthlyBudgetUSD set, computes
// month-to-date spend via the LiteLLM client, and returns them sorted
// by percent_used desc. Tenants without a budget cap are skipped
// (they'd always be percent=0 — noise). Audit P1 #29 (2026-05-27):
// before this endpoint, MonthlyBudgetUSD was display-only — the operator
// had no way to see who was approaching their cap until the LiteLLM
// hard-cap 429'd them.
//
// Spend lookup errors are reported per-tenant (in spend_error) instead
// of failing the whole response — one slow tenant shouldn't blind the
// operator to the others. Tenants with errors land at the bottom of
// the sort (percent_used=0 from default).
func (h *Handler) handleAdminTenantsBudgetStatus(w http.ResponseWriter, r *http.Request) {
	if h.Provisioner == nil || h.Provisioner.LiteLLM == nil {
		writeError(w, http.StatusServiceUnavailable,
			"LiteLLM client not configured — budget tracking unavailable")
		return
	}

	tenants, err := h.Tenants.List(r.Context(), false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list tenants: "+err.Error())
		return
	}

	// Bound the per-tenant LiteLLM call so a single slow lookup can't
	// hang the whole response. Generous timeout per tenant — 5s each
	// times the count, capped at 60s overall so a fleet of 100 doesn't
	// hang for 8 minutes if LiteLLM is sluggish.
	overall := 5 * time.Second * time.Duration(len(tenants))
	if overall > 60*time.Second {
		overall = 60 * time.Second
	}
	if overall < 5*time.Second {
		overall = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), overall)
	defer cancel()

	out := make([]budgetStatusEntry, 0, len(tenants))
	for _, t := range tenants {
		if t.MonthlyBudgetUSD == nil || *t.MonthlyBudgetUSD <= 0 {
			continue // no cap → no warning to surface
		}
		entry := budgetStatusEntry{
			TenantID:    t.ID,
			Subdomain:   t.Subdomain,
			DisplayName: t.DisplayName,
			IsPublic:    t.IsPublic,
			BudgetUSD:   *t.MonthlyBudgetUSD,
		}
		spend, err := h.Provisioner.LiteLLM.GetTenantSpendMTD(ctx, t.ID)
		if err != nil {
			entry.SpendError = err.Error()
		} else {
			entry.SpendMTDUSD = spend
			if entry.BudgetUSD > 0 {
				entry.PercentUsed = (spend / entry.BudgetUSD) * 100
			}
		}
		entry.Severity = budgetSeverity(entry.PercentUsed)
		out = append(out, entry)
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].PercentUsed > out[j].PercentUsed
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"generated_at": time.Now().UTC().Format(time.RFC3339),
		"count":        len(out),
		"tenants":      out,
	})
}
