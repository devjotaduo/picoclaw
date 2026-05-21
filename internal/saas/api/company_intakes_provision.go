package api

// Auto-provision: closes the loop from "Clara marked the intake qualified" to
// "tenant container is running and the visitor has a login". Hooked from
// handleCompanyIntakeChat after MarkQualified succeeds.
//
// Defensive features:
//   - dedup by owner email (no duplicate tenants for the same person)
//   - rate-limit per client IP (auto-provision is a money-spending action)
//   - subdomain collision retry with a random suffix
//   - rollback on Supabase failure (best-effort tenant delete) so we don't
//     leave orphaned containers with no login.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	supaauth "github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/mailer"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

var (
	ErrAutoProvisionDisabled = errors.New("auto-provision not enabled")
	ErrAutoProvisionThrottle = errors.New("too many provisions from this address, try again tomorrow")
	ErrMissingContact        = errors.New("missing contact email or company name")
)

// AutoProvisionResult is what Clara's SSE handler emits to the browser after
// a successful mark_qualified. Exactly one of MagicLink/InitialPassword is
// populated, matching the chosen LoginMode.
type AutoProvisionResult struct {
	Subdomain       string
	URL             string
	Email           string
	LoginMode       string
	InitialPassword string // populated when LoginMode == "password"
	MagicLink       string // populated when LoginMode == "magic_link"
	SupabaseUserID  string
	AlreadyExists   bool
}

// AutoProvisioner is constructed once at boot. Run() is safe for concurrent
// calls from different SSE handlers.
type AutoProvisioner struct {
	Cfg            *config.Config
	Provisioner    *tenant.Provisioner
	Supabase       *supaauth.SupabaseClient
	Tenants        *store.TenantStore
	CompanyIntakes *store.CompanyIntakeStore
	Reminders      *store.IntakeReminderStore // optional; when nil, no nudge emails
	// Mailer entrega o email "seu painel está pronto" com email + senha
	// juntos quando LoginMode=password. Nil quando SMTP não está
	// configurado — nesse caso a senha sai apenas no resultado SSE.
	Mailer *mailer.Mailer

	rateLimit *ipDailyLimiter
}

// NewAutoProvisioner returns nil when the feature is disabled in config so
// callers can branch on (h.AutoProvision == nil) without re-checking flags.
func NewAutoProvisioner(
	cfg *config.Config,
	prov *tenant.Provisioner,
	supa *supaauth.SupabaseClient,
	db *store.DB,
	mlr *mailer.Mailer,
) *AutoProvisioner {
	if !cfg.AutoProvisionEnabled {
		return nil
	}
	return &AutoProvisioner{
		Cfg:            cfg,
		Provisioner:    prov,
		Supabase:       supa,
		Tenants:        &store.TenantStore{DB: db},
		CompanyIntakes: &store.CompanyIntakeStore{DB: db},
		Reminders:      &store.IntakeReminderStore{DB: db},
		Mailer:         mlr,
		rateLimit:      newIPDailyLimiter(cfg.AutoProvisionPerIPDay),
	}
}

// reminderSchedule defines the offsets and templates for the three nudge
// emails that fire after a successful auto-provision. Kept as a package
// var so tests can swap to short intervals.
var reminderSchedule = []struct {
	After    time.Duration
	Template store.ReminderTemplate
}{
	{After: 24 * time.Hour, Template: store.ReminderTemplateFirst},
	{After: 72 * time.Hour, Template: store.ReminderTemplateSecond},
	{After: 7 * 24 * time.Hour, Template: store.ReminderTemplateLast},
}

// Run is idempotent on dedup: if a tenant already exists with the same
// owner_email, it returns AlreadyExists=true with the existing URL instead of
// erroring or duplicating.
func (a *AutoProvisioner) Run(
	ctx context.Context,
	intake *store.CompanyIntake,
	clientIP string,
) (*AutoProvisionResult, error) {
	if a == nil {
		return nil, ErrAutoProvisionDisabled
	}
	email := strings.TrimSpace(intake.ContactEmail)
	company := strings.TrimSpace(intake.CompanyName)
	if email == "" || company == "" {
		return nil, ErrMissingContact
	}

	if !a.rateLimit.Allow(clientIP) {
		return nil, ErrAutoProvisionThrottle
	}

	if existing, err := a.Tenants.GetByOwnerEmail(ctx, email); err == nil && existing != nil {
		return &AutoProvisionResult{
			URL:           tenantURL(a.Cfg, existing.Subdomain),
			Subdomain:     existing.Subdomain,
			Email:         email,
			AlreadyExists: true,
		}, nil
	} else if err != nil && !errors.Is(err, store.ErrTenantNotFound) {
		return nil, fmt.Errorf("dedup: %w", err)
	}

	subdomain, err := a.deriveSubdomain(ctx, company)
	if err != nil {
		return nil, fmt.Errorf("subdomain: %w", err)
	}

	useSupabase := a.Supabase != nil
	authBackend := "local"
	if useSupabase {
		authBackend = "supabase"
	}

	out, err := a.Provisioner.Create(ctx, tenant.CreateInput{
		DisplayName:           company,
		OwnerEmail:            email,
		Subdomain:             subdomain,
		LauncherProfileID:     a.Cfg.AutoProvisionProfile,
		MemLimitMB:            512,
		CPUQuota:              0.5,
		SkipDashboardPassword: useSupabase,
		AuthBackend:           authBackend,
	})
	if err != nil {
		return nil, fmt.Errorf("provision tenant: %w", err)
	}

	// Translate the Clara intake into the new tenant's memory + config so
	// Sofia's heartbeat picks up the pre-filled rows (marked "pendente de
	// validação") and confirms them with the owner on the first WhatsApp
	// turn. Without this step the visitor would re-type everything Clara
	// already collected. Errors here are non-fatal — the tenant still has
	// the empty profile templates as a fallback.
	t, gerr := a.Tenants.Get(ctx, out.TenantID)
	if gerr == nil && t != nil && t.VolumePath != "" {
		if serr := tenant.SeedTenantFromIntake(t.VolumePath, intake); serr != nil {
			// Log via the error path; the rest of provisioning proceeds.
			return nil, fmt.Errorf("seed intake: %w", serr)
		}
	}

	// Overlay the operator's currently-configured local workspace on top of
	// whatever the profile seeded, then restart the container so the launcher
	// reloads AGENT.md / SOUL.md / behavior.json / skills/ from disk. Lets
	// the operator edit workspace/ locally and have new tenants reflect the
	// live state, not a frozen profile copy. Memory files are non-clobbering
	// in the overlay, so the intake seed above wins for new tenants and
	// existing tenants keep their accumulated data on re-overlay.
	if a.Cfg.AutoProvisionWorkspaceDir != "" {
		if t == nil {
			t, gerr = a.Tenants.Get(ctx, out.TenantID)
		}
		if gerr == nil && t != nil && t.VolumePath != "" {
			if oerr := tenant.OverlayWorkspace(a.Cfg.AutoProvisionWorkspaceDir, t.VolumePath); oerr != nil {
				return nil, fmt.Errorf("overlay workspace: %w", oerr)
			}
			if rerr := a.Provisioner.Restart(ctx, out.TenantID); rerr != nil {
				return nil, fmt.Errorf("restart after workspace overlay: %w", rerr)
			}
		}
	}

	res := &AutoProvisionResult{
		Subdomain: subdomain,
		URL:       out.URL,
		Email:     email,
		// LoginMode é populado abaixo: "password" no caminho Supabase
		// (também sai magic_link no email), "password" no caminho legacy.
	}

	if useSupabase {
		// Sempre cria o user com senha (EmailConfirm=true) — Supabase em
		// mode 'password' não envia email automaticamente, então a entrega
		// é nossa.
		userID, _, suerr := a.Supabase.CreateTenantOwner(
			email, out.TenantID, subdomain,
			supaauth.LoginModePassword, out.InitialPassword,
		)
		if suerr != nil {
			// Best-effort rollback. We don't want a tenant the visitor can never
			// log into. Logged via the SSE provision_error emit at the caller.
			_ = a.Provisioner.Delete(ctx, out.TenantID)
			return nil, fmt.Errorf("supabase user: %w", suerr)
		}
		if err := a.Tenants.SetSupabaseUserID(ctx, out.TenantID, userID); err != nil {
			return nil, fmt.Errorf("save supabase user id: %w", err)
		}
		// Gera magic link extra — entregamos URL + login + senha + magic
		// link juntos. Falha aqui não é fatal: o tenant continua acessível
		// via email + senha.
		var magicLink string
		if ml, mlerr := a.Supabase.GenerateMagicLink(email, subdomain); mlerr != nil {
			fmt.Printf("autoprovisioner: magic link generation failed for tenant %s: %v\n", out.TenantID, mlerr)
		} else {
			magicLink = ml
		}

		res.SupabaseUserID = userID
		res.InitialPassword = out.InitialPassword
		res.MagicLink = magicLink
		// Sempre 'password' a partir daqui — também temos magic link, mas o
		// SSE handler usa LoginMode pra decidir o que mostrar no chat. O
		// email transacional carrega ambos.
		res.LoginMode = string(supaauth.LoginModePassword)

		if a.Mailer != nil && a.Mailer.Enabled() {
			go a.Mailer.SendCredentialsEmail(email, company, out.URL, email, out.InitialPassword, magicLink)
		}
	} else {
		// Legacy mode: visitor logs in with the bcrypt-seeded local password.
		res.InitialPassword = out.InitialPassword
		res.LoginMode = "password"
	}

	// Best-effort link. Linked status helps the admin filter "already provisioned".
	_, _ = a.CompanyIntakes.LinkTenant(ctx, intake.ID, out.TenantID)

	// Schedule the three nudge emails. If the visitor engages before T+24h,
	// the gateway's first-auth hook cancels the pending rows. Failures here
	// are non-fatal — we'd rather have a tenant without reminders than
	// fail the whole provision over an insert.
	if a.Reminders != nil {
		now := time.Now().UTC()
		for _, step := range reminderSchedule {
			if _, rerr := a.Reminders.Schedule(
				ctx,
				intake.ID,
				now.Add(step.After),
				store.ReminderChannelEmail,
				step.Template,
			); rerr != nil {
				// Don't block on a single insert failing; log and continue.
				// The other two reminders may still go through.
				continue
			}
		}
	}

	return res, nil
}

// ResendMagicLink reissues a Supabase magic link for the tenant linked to
// this intake. Returns ErrAutoProvisionDisabled when Supabase is not wired
// up; ErrTenantNotFound if the intake has no tenant yet.
func (a *AutoProvisioner) ResendMagicLink(ctx context.Context, intake *store.CompanyIntake) (string, error) {
	if a == nil || a.Supabase == nil {
		return "", ErrAutoProvisionDisabled
	}
	if intake.LinkedTenantID == nil || *intake.LinkedTenantID == "" {
		return "", store.ErrTenantNotFound
	}
	t, err := a.Tenants.Get(ctx, *intake.LinkedTenantID)
	if err != nil {
		return "", err
	}
	return a.Supabase.GenerateMagicLink(t.OwnerEmail, t.Subdomain)
}

// tenantURL is the canonical https URL for this tenant's dashboard.
func tenantURL(cfg *config.Config, subdomain string) string {
	base := strings.Trim(cfg.TenantBaseDomain, ".")
	return "https://" + subdomain + "." + base
}

// deriveSubdomain slugifies the company name and resolves collisions with a
// short random suffix. Returns ErrSubdomainExhausted after 5 failed tries.
func (a *AutoProvisioner) deriveSubdomain(ctx context.Context, company string) (string, error) {
	base := slugify(company)
	if base == "" {
		base = "tenant"
	}
	if len(base) > 24 { // leave room for "-xxx" collision suffix
		base = base[:24]
	}
	if err := tenant.ValidateSubdomain(base); err == nil {
		if _, getErr := a.Tenants.GetBySubdomain(ctx, base); errors.Is(getErr, store.ErrTenantNotFound) {
			return base, nil
		}
	}
	for i := 0; i < 5; i++ {
		suffix, err := randomShortSuffix()
		if err != nil {
			return "", err
		}
		candidate := base + "-" + suffix
		if len(candidate) > 30 {
			candidate = candidate[len(candidate)-30:]
		}
		if err := tenant.ValidateSubdomain(candidate); err != nil {
			continue
		}
		if _, getErr := a.Tenants.GetBySubdomain(ctx, candidate); errors.Is(getErr, store.ErrTenantNotFound) {
			return candidate, nil
		}
	}
	return "", errors.New("could not derive a unique subdomain")
}

// slugify lowercases, strips accents-best-effort (no normalization here — we
// just drop non-ascii), and collapses runs of non-[a-z0-9] into a single dash.
var nonSlugChar = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlugChar.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// randomShortSuffix returns a 4-char hex suffix for breaking subdomain
// collisions (e.g. "acme" already taken → "acme-4f3a"). 16 bits is fine —
// we only need uniqueness within the same base slug, not globally.
func randomShortSuffix() (string, error) {
	b := make([]byte, 2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ipDailyLimiter is a tiny per-IP token bucket that resets every 24h. Stays
// in-process so it's lost on restart — acceptable for a low-stakes provision
// throttle.
type ipDailyLimiter struct {
	mu      sync.Mutex
	perDay  int
	hits    map[string]*ipHitState
	cleanup time.Time
}

type ipHitState struct {
	count    int
	resetsAt time.Time
}

func newIPDailyLimiter(perDay int) *ipDailyLimiter {
	if perDay <= 0 {
		perDay = 3
	}
	return &ipDailyLimiter{
		perDay:  perDay,
		hits:    make(map[string]*ipHitState),
		cleanup: time.Now().Add(24 * time.Hour),
	}
}

func (l *ipDailyLimiter) Allow(ip string) bool {
	if l == nil {
		return true
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.After(l.cleanup) {
		// Sweep expired entries opportunistically; daily cadence is fine.
		for k, v := range l.hits {
			if now.After(v.resetsAt) {
				delete(l.hits, k)
			}
		}
		l.cleanup = now.Add(24 * time.Hour)
	}
	st, ok := l.hits[ip]
	if !ok || now.After(st.resetsAt) {
		l.hits[ip] = &ipHitState{count: 1, resetsAt: now.Add(24 * time.Hour)}
		return true
	}
	if st.count >= l.perDay {
		return false
	}
	st.count++
	return true
}
