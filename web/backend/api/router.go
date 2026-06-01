package api

import (
	"net/http"
	"strings"
	"sync"

	"github.com/sipeed/picoclaw/web/backend/launcherconfig"
)

// Handler serves HTTP API requests.
type Handler struct {
	configPath               string
	serverPort               int
	serverPublic             bool
	serverPublicExplicit     bool
	serverHostInput          string
	serverHostExplicit       bool
	serverCIDRs              []string
	debug                    bool
	oauthMu                  sync.Mutex
	oauthCredentialMu        sync.Mutex
	oauthAutoRefreshOnce     sync.Once
	oauthAutoRefreshStopOnce sync.Once
	oauthAutoRefreshStop     chan struct{}
	oauthFlows               map[string]*oauthFlow
	oauthState               map[string]string
	weixinMu                 sync.Mutex
	weixinFlows              map[string]*weixinFlow
	wecomMu                  sync.Mutex
	wecomFlows               map[string]*wecomFlow
	agentTemplateMu          sync.Mutex
	templateOverridesMu      sync.Mutex
	notifications            *notificationStore
	attendantProposals       *attendantProposalStore
}

// NewHandler creates an instance of the API handler.
func NewHandler(configPath string) *Handler {
	return &Handler{
		configPath:  configPath,
		serverPort:  launcherconfig.DefaultPort,
		oauthFlows:  make(map[string]*oauthFlow),
		oauthState:  make(map[string]string),
		weixinFlows: make(map[string]*weixinFlow),
		wecomFlows:  make(map[string]*wecomFlow),
	}
}

// SetServerOptions stores current backend listen options for fallback behavior.
func (h *Handler) SetServerOptions(port int, public bool, publicExplicit bool, allowedCIDRs []string) {
	h.serverPort = port
	h.serverPublic = public
	h.serverPublicExplicit = publicExplicit
	h.serverHostInput = ""
	h.serverHostExplicit = false
	h.serverCIDRs = append([]string(nil), allowedCIDRs...)
}

// SetServerBindHost stores the launcher's effective bind host.
// When explicit is true, hostInput is the normalized -host / PICOCLAW_LAUNCHER_HOST value.
func (h *Handler) SetServerBindHost(hostInput string, explicit bool) {
	h.serverHostInput = strings.TrimSpace(hostInput)
	if !explicit {
		h.serverHostInput = ""
	}
	h.serverHostExplicit = explicit
}

func (h *Handler) SetDebug(debug bool) {
	h.debug = debug
}

// RegisterRoutes binds all API endpoint handlers to the ServeMux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Config CRUD
	h.registerConfigRoutes(mux)

	// Pico Channel (WebSocket chat)
	h.registerPicoRoutes(mux)

	// Gateway process lifecycle
	h.registerGatewayRoutes(mux)

	// Session history
	h.registerSessionRoutes(mux)

	// OAuth login and credential management
	h.registerOAuthRoutes(mux)

	// Model list management
	h.registerModelRoutes(mux)

	// Channel catalog (for frontend navigation/config pages)
	h.registerChannelRoutes(mux)

	// Skills and tools support/actions
	h.registerSkillRoutes(mux)
	h.registerToolRoutes(mux)

	// Agent templates (apply preset workspace AGENT.md/SOUL.md)
	h.registerAgentTemplateRoutes(mux)

	// Workspace-defined agents from workspace/agents/*.md.
	h.registerWorkspaceAgentRoutes(mux)

	// Company data readiness checklist used by the launcher onboarding card.
	h.registerCompanyOnboardingRoutes(mux)

	// Public-tenant onboarding state machine. Drives the tenant dashboard
	// after Sofia/Catarina and after admin promotion.
	h.registerOnboardingStateRoutes(mux)

	// Private pre-provisioned tenants can start in test mode and let the
	// owner confirm when the workspace is ready for production.
	h.registerTestModeRoutes(mux)

	// Structured interaction + tool-call audit logs from workspace/state.
	h.registerInteractionLogsRoutes(mux)

	// Guided company profile form backed by workspace Markdown memory/config.
	h.registerCompanyProfileRoutes(mux)

	// Aggregated operational dashboard for agent results, analyses, tasks,
	// metrics, reports, and file-based dashboard publications.
	h.registerAgentDashboardRoutes(mux)

	// Workspace memory files (workspace/memory/*.md): list, read, write.
	h.registerWorkspaceMemoryRoutes(mux)

	// Pendencias extracted from memory files (PENDENCIAS: blocks).
	h.registerPendenciasRoutes(mux)

	// Per-agent readiness semaforo (workspace memory completeness).
	h.registerReadinessRoutes(mux)

	// Tenant-wide validate readiness (runs validate_workspace.py) +
	// integration mark-resolved (writes sidecar). Espelha o que o admin
	// vê em adm.<base>/tenants/discovery mas no escopo do próprio tenant.
	h.registerWorkspaceValidateRoutes(mux)

	// Cron jobs read-only view (reads workspace/cron/jobs.json).
	h.registerCronRoutes(mux)

	// Agent prompt version history (server-side replacement for the
	// localStorage fallback the frontend uses when this endpoint is
	// unavailable).
	h.registerAgentVersionRoutes(mux)

	// Internal panel agents and orchestration controls.
	h.registerInternalAgentRoutes(mux)

	// Notification panel — short messages que agentes (main/pixel/doc/dev)
	// disparam pro usuário via tool `notify_user` ou diretamente via
	// POST /api/notifications. Servido no rodapé do sidebar.
	h.registerNotificationRoutes(mux)

	// Attendant config proposals — v2.0 approval-always flow: the assistant
	// agent stages a proposed change (internal token), the owner approves it
	// from the dashboard, and approval replays through applyAgentDefinition.
	h.registerAttendantProposalRoutes(mux)

	// Public marketing artifacts generated by Maya.
	h.registerPublicMarketingRoutes(mux)

	// Buffer API publish proxy for Instagram scheduling.
	h.registerBufferPublishRoutes(mux)

	// OS startup / launch-at-login
	h.registerStartupRoutes(mux)

	// Launcher service parameters (port/public)
	h.registerLauncherConfigRoutes(mux)

	// Self-update endpoint (requires dashboard auth)
	h.registerUpdateRoutes(mux)

	// Runtime build/version metadata
	h.registerVersionRoutes(mux)

	// Tenant role policy exposed to the launcher frontend.
	h.registerLauncherPolicyRoutes(mux)

	// Per-tenant ui-visibility.json from $PICOCLAW_HOME — drives sidebar /
	// header / chat visibility per active_profile (public/tenant/admin/waiting).
	h.registerLauncherUIVisibilityRoutes(mux)

	// Inbound webhook from the jotaduo-wa sidecar. Only active in public
	// tenants (the provisioner injects JOTADUO_WA_HMAC_SECRET only there);
	// cliente tenants reject with 503 by design.
	h.registerJotaduoWAInboundRoutes(mux)

	// SaaS admin proxy — forwards /api/admin/saas/* to the controlplane on
	// behalf of the launcher dashboard user. Disabled unless the launcher is
	// configured with PICOCLAW_SAAS_ADMIN_MODE=true plus base/email/password.
	h.registerSaaSProxyRoutes(mux)

	// WeChat QR login flow
	h.registerWeixinRoutes(mux)

	// WeCom QR login flow
	h.registerWecomRoutes(mux)

	// WhatsApp native pairing QR
	h.registerWhatsAppNativeRoutes(mux)

	// WhatsApp inbox dashboard (chats, messages, pause, manual send, SSE)
	h.registerWhatsAppInboxRoutes(mux)
}

// Shutdown gracefully shuts down the handler, stopping the gateway if it was started by this handler.
func (h *Handler) Shutdown() {
	h.stopOAuthAutoRefresh()
	h.StopGateway()
}
