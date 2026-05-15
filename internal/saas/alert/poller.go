package alert

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// Poller checks for alertable conditions every Interval and fires emails via
// the Notifier. Two checks today:
//   - tenants in 'error' status
//   - data dir disk usage above DiskThresholdPct
type Poller struct {
	DB               *store.DB
	Notifier         *Notifier
	DataDir          string  // e.g. /srv/saas/tenants
	DiskThresholdPct float64 // e.g. 85 means alert at 85%
	Interval         time.Duration
}

func (p *Poller) Run(ctx context.Context) {
	if p.Interval <= 0 {
		p.Interval = 5 * time.Minute
	}
	if p.DiskThresholdPct <= 0 {
		p.DiskThresholdPct = 85
	}
	t := time.NewTicker(p.Interval)
	defer t.Stop()
	p.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.tick(ctx)
		}
	}
}

func (p *Poller) tick(ctx context.Context) {
	p.checkErrorTenants(ctx)
	p.checkDisk()
}

func (p *Poller) checkErrorTenants(ctx context.Context) {
	ts := &store.TenantStore{DB: p.DB}
	errs, err := ts.ListByStatus(ctx, store.StatusError)
	if err != nil {
		log.Printf("alert: list error tenants: %v", err)
		return
	}
	if len(errs) == 0 {
		return
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%d tenant(s) are in error state:\n\n", len(errs))
	for _, t := range errs {
		last := "(no error message recorded)"
		if t.LastError != nil {
			last = *t.LastError
		}
		fmt.Fprintf(&b, "  - %s (%s)\n      last error: %s\n", t.ID, t.Subdomain, last)
	}
	b.WriteString("\nInspect with: GET /api/v1/tenants/<id>\n")
	p.Notifier.Notify(
		"tenants-error",
		fmt.Sprintf("[picoclaw-saas] %d tenant(s) in error state", len(errs)),
		b.String(),
	)
}

func (p *Poller) checkDisk() {
	if p.DataDir == "" {
		return
	}
	used, err := diskUsedPct(p.DataDir)
	if err != nil {
		log.Printf("alert: statfs %s: %v", p.DataDir, err)
		return
	}
	if used < p.DiskThresholdPct {
		return
	}
	p.Notifier.Notify(
		"disk-full",
		fmt.Sprintf("[picoclaw-saas] disk usage %.0f%% on %s", used, p.DataDir),
		fmt.Sprintf(
			"Disk usage at %s is %.1f%% (threshold %.0f%%).\n\n"+
				"Free space by purging old tenants under /srv/saas/backups/deleted/, "+
				"pruning Docker images, or growing the volume.\n",
			p.DataDir, used, p.DiskThresholdPct,
		),
	)
}

// diskUsedPct is defined in poller_unix.go and poller_windows.go.
