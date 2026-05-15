// Package reconciler runs background loops that keep the DB and external
// systems (Docker, LiteLLM) consistent.
package reconciler

import (
	"context"
	"log"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type UsagePoller struct {
	DB       *store.DB
	LiteLLM  *litellm.Client
	Interval time.Duration
}

func (p *UsagePoller) Run(ctx context.Context) {
	if p.Interval <= 0 {
		p.Interval = 5 * time.Minute
	}
	t := time.NewTicker(p.Interval)
	defer t.Stop()

	// Tick once at startup so we don't wait Interval after a restart.
	p.poll(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.poll(ctx)
		}
	}
}

func (p *UsagePoller) poll(ctx context.Context) {
	tenants, err := (&store.TenantStore{DB: p.DB}).List(ctx, false)
	if err != nil {
		log.Printf("usage-poller: list tenants: %v", err)
		return
	}
	usage := &store.UsageStore{DB: p.DB}

	for _, t := range tenants {
		if t.LiteLLMKeyID == nil || *t.LiteLLMKeyID == "" {
			continue
		}
		last, err := usage.LastTimestamp(ctx, t.ID)
		if err != nil {
			log.Printf("usage-poller: %s: last ts: %v", t.ID, err)
			continue
		}
		// Look back 1 day so we never miss records on the boundary.
		since := last.Add(-24 * time.Hour)
		records, err := p.LiteLLM.GetSpendLogs(ctx, t.ID, since)
		if err != nil {
			log.Printf("usage-poller: %s: spend logs: %v", t.ID, err)
			continue
		}
		inserted := 0
		for _, r := range records {
			ts := r.StartTime
			if ts.IsZero() {
				ts = r.EndTime
			}
			ok, err := usage.InsertIgnoreDup(ctx, &store.UsageLog{
				TenantID:         t.ID,
				Timestamp:        ts,
				Provider:         r.Provider,
				Model:            r.Model,
				PromptTokens:     r.PromptTokens,
				CompletionTokens: r.CompletionTokens,
				CostUSD:          r.Spend,
			})
			if err != nil {
				log.Printf("usage-poller: %s: insert: %v", t.ID, err)
				continue
			}
			if ok {
				inserted++
			}
		}
		if inserted > 0 {
			log.Printf("usage-poller: %s: inserted %d records", t.ID, inserted)
		}
	}
}
