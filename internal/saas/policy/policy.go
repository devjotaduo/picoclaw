package policy

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Access string

const (
	AccessNone  Access = "none"
	AccessRead  Access = "read"
	AccessWrite Access = "write"
)

const (
	RolePlatformAdmin = "platform_admin"
	RoleTenantOwner   = "tenant_owner"
	RoleTenantAdmin   = "tenant_admin"
	RoleOperator      = "operator"
	RoleViewer        = "viewer"
)

const (
	FeatureChat            = "chat"
	FeatureModels          = "models"
	FeatureCredentials     = "credentials"
	FeatureChannels        = "channels"
	FeatureAgentEditor     = "agent_editor"
	FeatureAgentHub        = "agent_hub"
	FeatureAgentTemplates  = "agent_templates"
	FeatureTemplateEditor  = "template_editor"
	FeatureInternalAgents  = "internal_agents"
	FeatureSkills          = "skills"
	FeatureSkillEditor     = "skill_editor"
	FeatureTools           = "tools"
	FeatureConfig          = "config"
	FeatureRawConfig       = "raw_config"
	FeatureLogs            = "logs"
	FeatureWhatsAppInbox   = "whatsapp_inbox"
	FeatureWhatsAppReports = "whatsapp_reports"
)

var baseFeatureIDs = []string{
	FeatureChat,
	FeatureModels,
	FeatureCredentials,
	FeatureChannels,
	FeatureAgentEditor,
	FeatureAgentHub,
	FeatureAgentTemplates,
	FeatureTemplateEditor,
	FeatureInternalAgents,
	FeatureSkills,
	FeatureSkillEditor,
	FeatureTools,
	FeatureConfig,
	FeatureRawConfig,
	FeatureLogs,
	FeatureWhatsAppInbox,
	FeatureWhatsAppReports,
}

type RolePolicy map[string]map[string]Access

type LauncherPolicyFile struct {
	RolePolicy RolePolicy `json:"role_policy"`
}

type RoleCatalogItem struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type AccessCatalogItem struct {
	ID          Access `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type FeatureGroupCatalogItem struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type FeatureCatalogItem struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Group       string `json:"group"`
	Fallback    string `json:"fallback,omitempty"`
}

type Catalog struct {
	Roles             []RoleCatalogItem         `json:"roles"`
	AccessLevels      []AccessCatalogItem       `json:"access_levels"`
	Groups            []FeatureGroupCatalogItem `json:"groups"`
	Features          []FeatureCatalogItem      `json:"features"`
	DefaultRolePolicy RolePolicy                `json:"default_role_policy"`
}

const channelFeaturePrefix = "channel:"

var ChannelIDs = []string{
	"weixin",
	"telegram",
	"discord",
	"slack",
	"feishu",
	"dingtalk",
	"line",
	"qq",
	"onebot",
	"wecom",
	"whatsapp",
	"whatsapp_native",
	"pico",
	"maixcam",
	"matrix",
	"irc",
	"mqtt",
}

var FeatureIDs = buildFeatureIDs()

func DefaultRolePolicy() RolePolicy {
	writeAll := map[string]Access{}
	for _, feature := range FeatureIDs {
		writeAll[feature] = AccessWrite
	}
	admin := map[string]Access{}
	for _, feature := range FeatureIDs {
		admin[feature] = AccessWrite
	}
	operator := map[string]Access{}
	for _, feature := range FeatureIDs {
		operator[feature] = AccessNone
	}
	operator[FeatureChat] = AccessWrite
	operator[FeatureWhatsAppInbox] = AccessWrite
	operator[FeatureWhatsAppReports] = AccessRead
	operator[FeatureLogs] = AccessRead

	viewer := map[string]Access{}
	for _, feature := range FeatureIDs {
		viewer[feature] = AccessRead
	}
	viewer[FeatureModels] = AccessNone
	viewer[FeatureCredentials] = AccessNone
	viewer[FeatureRawConfig] = AccessNone
	viewer[FeatureInternalAgents] = AccessNone

	return RolePolicy{
		RoleTenantOwner: writeAll,
		RoleTenantAdmin: admin,
		RoleOperator:    operator,
		RoleViewer:      viewer,
	}
}

func NormalizeRolePolicy(in RolePolicy) RolePolicy {
	base := DefaultRolePolicy()
	explicit := map[string]map[string]bool{}
	for role, features := range in {
		if _, ok := base[role]; !ok {
			base[role] = map[string]Access{}
		}
		if _, ok := explicit[role]; !ok {
			explicit[role] = map[string]bool{}
		}
		for feature, access := range features {
			if !knownFeature(feature) {
				continue
			}
			switch access {
			case AccessNone, AccessRead, AccessWrite:
				base[role][feature] = access
				explicit[role][feature] = true
			}
		}
	}
	applyDerivedFeatureFallbacks(base, explicit)
	return base
}

func LoadFile(home string) (LauncherPolicyFile, error) {
	if home == "" {
		return LauncherPolicyFile{RolePolicy: DefaultRolePolicy()}, nil
	}
	path := filepath.Join(home, "launcher_policy.json")
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return LauncherPolicyFile{RolePolicy: DefaultRolePolicy()}, nil
		}
		return LauncherPolicyFile{}, err
	}
	var f LauncherPolicyFile
	if err := json.Unmarshal(b, &f); err != nil {
		return LauncherPolicyFile{}, err
	}
	f.RolePolicy = NormalizeRolePolicy(f.RolePolicy)
	return f, nil
}

func WriteFile(home string, rolePolicy RolePolicy) error {
	if home == "" {
		return nil
	}
	if err := os.MkdirAll(home, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(LauncherPolicyFile{RolePolicy: NormalizeRolePolicy(rolePolicy)}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(home, "launcher_policy.json"), append(b, '\n'), 0o644)
}

func EffectiveFeatures(role string, rolePolicy RolePolicy) map[string]Access {
	out := map[string]Access{}
	if role == RolePlatformAdmin {
		for _, feature := range FeatureIDs {
			out[feature] = AccessWrite
		}
		return out
	}
	rolePolicy = NormalizeRolePolicy(rolePolicy)
	features := rolePolicy[role]
	for _, feature := range FeatureIDs {
		out[feature] = AccessNone
		if access, ok := features[feature]; ok {
			out[feature] = access
		}
	}
	return out
}

func Allowed(role string, rolePolicy RolePolicy, feature string, required Access) bool {
	if required == AccessNone || feature == "" {
		return true
	}
	if role == RolePlatformAdmin {
		return true
	}
	features := EffectiveFeatures(role, rolePolicy)
	access := features[feature]
	if required == AccessRead {
		if feature == FeatureChannels && (access != AccessRead && access != AccessWrite) {
			for _, channel := range ChannelIDs {
				channelAccess := features[ChannelFeature(channel)]
				if channelAccess == AccessRead || channelAccess == AccessWrite {
					return true
				}
			}
		}
		return access == AccessRead || access == AccessWrite
	}
	return access == AccessWrite
}

func FeatureForRequest(method, requestPath string) (string, Access, bool) {
	if method == http.MethodOptions || method == http.MethodHead {
		return "", AccessRead, false
	}
	required := AccessWrite
	if method == http.MethodGet {
		required = AccessRead
	}
	p := normalizePath(requestPath)

	switch {
	case p == "/pico/ws" || p == "/api/pico/info" || p == "/api/pico/token" || p == "/api/pico/setup" || strings.HasPrefix(p, "/pico/media/"):
		return FeatureChat, required, true
	case p == "/api/models" || strings.HasPrefix(p, "/api/models/"):
		return FeatureModels, required, true
	case strings.HasPrefix(p, "/api/oauth/") || p == "/oauth/callback":
		return FeatureCredentials, required, true
	case p == "/api/channels/catalog" || p == "/api/channels/status":
		return FeatureChannels, required, true
	case strings.HasPrefix(p, "/api/channels/"):
		channel := firstPathSegment(strings.TrimPrefix(p, "/api/channels/"))
		if channel != "" && knownChannel(channel) {
			return ChannelFeature(channel), required, true
		}
		return FeatureChannels, required, true
	case strings.HasPrefix(p, "/api/weixin/"):
		return ChannelFeature("weixin"), required, true
	case strings.HasPrefix(p, "/api/wecom/"):
		return ChannelFeature("wecom"), required, true
	case strings.HasPrefix(p, "/api/whatsapp_native/"):
		return ChannelFeature("whatsapp_native"), required, true
	case p == "/api/agent/config" || p == "/api/agent/editor-state" || p == "/api/agents" || strings.HasPrefix(p, "/api/agents/"):
		return FeatureAgentEditor, required, true
	case strings.HasPrefix(p, "/api/agent/templates/overrides/"):
		return FeatureTemplateEditor, required, true
	case p == "/api/agent/templates/overrides":
		if method == http.MethodGet {
			return FeatureAgentTemplates, AccessRead, true
		}
		return FeatureTemplateEditor, required, true
	case p == "/api/agent/templates/apply":
		return FeatureAgentTemplates, required, true
	case p == "/api/internal-agents" || strings.HasPrefix(p, "/api/internal-agents/"):
		return FeatureInternalAgents, required, true
	case p == "/api/skills/search" || p == "/api/skills/install":
		return FeatureAgentHub, required, true
	case p == "/api/skills/import":
		return FeatureSkills, required, true
	case strings.HasSuffix(p, "/raw") && strings.HasPrefix(p, "/api/skills/"):
		return FeatureSkillEditor, required, true
	case strings.HasPrefix(p, "/api/skills/") && method == http.MethodPut:
		return FeatureSkillEditor, required, true
	case p == "/api/skills" || strings.HasPrefix(p, "/api/skills/"):
		return FeatureSkills, required, true
	case p == "/api/tools" && method == http.MethodGet:
		return FeatureAgentHub, AccessRead, true
	case p == "/api/tools" || strings.HasPrefix(p, "/api/tools/"):
		return FeatureTools, required, true
	case p == "/api/config/test-command-patterns":
		return FeatureConfig, AccessWrite, true
	case p == "/api/config":
		if method == http.MethodGet {
			return FeatureRawConfig, AccessRead, true
		}
		return FeatureConfig, AccessWrite, true
	case strings.HasPrefix(p, "/api/system/launcher-config") || strings.HasPrefix(p, "/api/system/autostart") || p == "/api/update":
		return FeatureConfig, required, true
	case strings.HasPrefix(p, "/api/gateway/logs") || p == "/api/gateway/status" || p == "/api/system/version":
		return FeatureLogs, required, true
	case strings.HasPrefix(p, "/api/gateway/"):
		return FeatureConfig, required, true
	case strings.HasPrefix(p, "/api/sessions/") || p == "/api/sessions":
		return FeatureChat, required, true
	case strings.HasPrefix(p, "/api/whatsapp/reports"):
		return FeatureWhatsAppReports, required, true
	case strings.HasPrefix(p, "/api/whatsapp/"):
		return FeatureWhatsAppInbox, required, true
	default:
		return "", required, false
	}
}

func ChannelFeature(name string) string {
	return channelFeaturePrefix + strings.TrimSpace(name)
}

func PolicyCatalog() Catalog {
	return Catalog{
		Roles: []RoleCatalogItem{
			{ID: RoleTenantOwner, Label: "Dono", Description: "Acesso completo dentro do tenant, incluindo membros e convites."},
			{ID: RoleTenantAdmin, Label: "Administrador", Description: "Administra configuracoes, agentes e operacao do tenant."},
			{ID: RoleOperator, Label: "Operador", Description: "Atende conversas e executa rotinas operacionais."},
			{ID: RoleViewer, Label: "Visualizador", Description: "Consulta informacoes sem alterar configuracoes sensiveis."},
		},
		AccessLevels: []AccessCatalogItem{
			{ID: AccessNone, Label: "Nenhum", Description: "Oculta a area e bloqueia a API protegida."},
			{ID: AccessRead, Label: "Leitura", Description: "Permite consultar a area sem acoes de escrita."},
			{ID: AccessWrite, Label: "Escrita", Description: "Permite consultar e alterar a area."},
		},
		Groups: []FeatureGroupCatalogItem{
			{ID: "conversation", Label: "Conversa", Description: "Chat e interacao diaria."},
			{ID: "models_credentials", Label: "Modelos e Credenciais", Description: "Provedores, modelos e logins de IA."},
			{ID: "channels", Label: "Canais", Description: "Conectores de atendimento e entrada."},
			{ID: "agent", Label: "Agente", Description: "Agentes, templates, skills e hub."},
			{ID: "configuration", Label: "Configuracao", Description: "Ferramentas e ajustes tecnicos."},
			{ID: "audit", Label: "Auditoria", Description: "Logs e areas internas."},
		},
		Features:          policyCatalogFeatures(),
		DefaultRolePolicy: DefaultRolePolicy(),
	}
}

func knownFeature(feature string) bool {
	for _, known := range FeatureIDs {
		if feature == known {
			return true
		}
	}
	return false
}

func buildFeatureIDs() []string {
	out := append([]string{}, baseFeatureIDs...)
	for _, channel := range ChannelIDs {
		out = append(out, ChannelFeature(channel))
	}
	return out
}

func applyDerivedFeatureFallbacks(rolePolicy RolePolicy, explicit map[string]map[string]bool) {
	for role, features := range rolePolicy {
		roleExplicit := explicit[role]
		for feature, fallback := range fineFeatureFallbacks() {
			if roleExplicit != nil && roleExplicit[feature] {
				continue
			}
			if roleExplicit == nil || !roleExplicit[fallback] {
				continue
			}
			features[feature] = features[fallback]
		}
		for _, channel := range ChannelIDs {
			feature := ChannelFeature(channel)
			if roleExplicit != nil && roleExplicit[feature] {
				continue
			}
			if roleExplicit == nil || !roleExplicit[FeatureChannels] {
				continue
			}
			features[feature] = features[FeatureChannels]
		}
	}
}

func fineFeatureFallbacks() map[string]string {
	return map[string]string{
		FeatureAgentHub:        FeatureTools,
		FeatureTemplateEditor:  FeatureAgentTemplates,
		FeatureSkillEditor:     FeatureSkills,
		FeatureWhatsAppReports: FeatureWhatsAppInbox,
	}
}

func policyCatalogFeatures() []FeatureCatalogItem {
	features := []FeatureCatalogItem{
		{ID: FeatureChat, Label: "Chat", Description: "Pagina de conversa principal.", Group: "conversation"},
		{ID: FeatureModels, Label: "Modelos", Description: "Modelos, provedores e default de IA.", Group: "models_credentials"},
		{ID: FeatureCredentials, Label: "Credenciais", Description: "OAuth e credenciais de provedores.", Group: "models_credentials"},
		{ID: FeatureChannels, Label: "Todos os canais", Description: "Catalogo e estado geral dos canais.", Group: "channels"},
	}
	for _, channel := range ChannelIDs {
		features = append(features, FeatureCatalogItem{
			ID:          ChannelFeature(channel),
			Label:       channelLabel(channel),
			Description: "Configuracao do canal " + channelLabel(channel) + ".",
			Group:       "channels",
			Fallback:    FeatureChannels,
		})
	}
	features = append(features,
		FeatureCatalogItem{ID: FeatureAgentEditor, Label: "Editor do agente", Description: "Configuracao de agentes e perfis.", Group: "agent"},
		FeatureCatalogItem{ID: FeatureAgentHub, Label: "Hub", Description: "Busca e instalacao pelo Hub.", Group: "agent", Fallback: FeatureTools},
		FeatureCatalogItem{ID: FeatureAgentTemplates, Label: "Templates", Description: "Aplicacao de templates de agente.", Group: "agent"},
		FeatureCatalogItem{ID: FeatureTemplateEditor, Label: "Editor de templates", Description: "Edicao de templates e overrides.", Group: "agent", Fallback: FeatureAgentTemplates},
		FeatureCatalogItem{ID: FeatureSkills, Label: "Skills", Description: "Biblioteca, importacao e remocao de skills.", Group: "agent"},
		FeatureCatalogItem{ID: FeatureSkillEditor, Label: "Editor de skills", Description: "Leitura raw e edicao de SKILL.md.", Group: "agent", Fallback: FeatureSkills},
		FeatureCatalogItem{ID: FeatureWhatsAppInbox, Label: "WhatsApp Inbox", Description: "Caixa de entrada e acoes manuais do WhatsApp.", Group: "agent"},
		FeatureCatalogItem{ID: FeatureWhatsAppReports, Label: "Relatorios WhatsApp", Description: "Relatorios e leitura analitica do WhatsApp.", Group: "agent", Fallback: FeatureWhatsAppInbox},
		FeatureCatalogItem{ID: FeatureTools, Label: "Ferramentas", Description: "Configuracao das ferramentas do agente.", Group: "configuration"},
		FeatureCatalogItem{ID: FeatureConfig, Label: "Configuracao", Description: "Configuracoes operacionais do launcher.", Group: "configuration"},
		FeatureCatalogItem{ID: FeatureRawConfig, Label: "Configuracao raw", Description: "Leitura direta do config.json.", Group: "configuration"},
		FeatureCatalogItem{ID: FeatureLogs, Label: "Logs", Description: "Logs e status de runtime.", Group: "audit"},
		FeatureCatalogItem{ID: FeatureInternalAgents, Label: "Agentes internos", Description: "Painel e chamadas dos agentes internos.", Group: "audit"},
	)
	return features
}

func channelLabel(channel string) string {
	switch channel {
	case "weixin":
		return "Weixin"
	case "wecom":
		return "WeCom"
	case "whatsapp":
		return "WhatsApp Bridge"
	case "whatsapp_native":
		return "WhatsApp Native"
	case "onebot":
		return "OneBot"
	case "maixcam":
		return "MaixCam"
	case "mqtt":
		return "MQTT"
	case "irc":
		return "IRC"
	case "qq":
		return "QQ"
	default:
		if channel == "" {
			return ""
		}
		return strings.ToUpper(channel[:1]) + channel[1:]
	}
}

func knownChannel(channel string) bool {
	for _, known := range ChannelIDs {
		if channel == known {
			return true
		}
	}
	return false
}

func firstPathSegment(s string) string {
	s = strings.Trim(s, "/")
	if s == "" {
		return ""
	}
	if i := strings.IndexByte(s, '/'); i >= 0 {
		return s[:i]
	}
	return s
}

func normalizePath(p string) string {
	if p == "" {
		return "/"
	}
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimRight(p, "/")
}
