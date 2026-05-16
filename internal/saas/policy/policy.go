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
	FeatureChat           = "chat"
	FeatureModels         = "models"
	FeatureCredentials    = "credentials"
	FeatureChannels       = "channels"
	FeatureAgentEditor    = "agent_editor"
	FeatureAgentTemplates = "agent_templates"
	FeatureSkills         = "skills"
	FeatureTools          = "tools"
	FeatureConfig         = "config"
	FeatureRawConfig      = "raw_config"
	FeatureLogs           = "logs"
	FeatureWhatsAppInbox  = "whatsapp_inbox"
)

var FeatureIDs = []string{
	FeatureChat,
	FeatureModels,
	FeatureCredentials,
	FeatureChannels,
	FeatureAgentEditor,
	FeatureAgentTemplates,
	FeatureSkills,
	FeatureTools,
	FeatureConfig,
	FeatureRawConfig,
	FeatureLogs,
	FeatureWhatsAppInbox,
}

type RolePolicy map[string]map[string]Access

type LauncherPolicyFile struct {
	RolePolicy RolePolicy `json:"role_policy"`
}

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
	operator[FeatureLogs] = AccessRead

	viewer := map[string]Access{}
	for _, feature := range FeatureIDs {
		viewer[feature] = AccessRead
	}
	viewer[FeatureCredentials] = AccessNone
	viewer[FeatureRawConfig] = AccessNone

	return RolePolicy{
		RoleTenantOwner: writeAll,
		RoleTenantAdmin: admin,
		RoleOperator:    operator,
		RoleViewer:      viewer,
	}
}

func NormalizeRolePolicy(in RolePolicy) RolePolicy {
	base := DefaultRolePolicy()
	for role, features := range in {
		if _, ok := base[role]; !ok {
			base[role] = map[string]Access{}
		}
		for feature, access := range features {
			if !knownFeature(feature) {
				continue
			}
			switch access {
			case AccessNone, AccessRead, AccessWrite:
				base[role][feature] = access
			}
		}
	}
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
	access := EffectiveFeatures(role, rolePolicy)[feature]
	if required == AccessRead {
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
	case p == "/api/channels/catalog" || p == "/api/channels/status" || strings.HasPrefix(p, "/api/channels/") ||
		strings.HasPrefix(p, "/api/weixin/") || strings.HasPrefix(p, "/api/wecom/") || strings.HasPrefix(p, "/api/whatsapp_native/"):
		return FeatureChannels, required, true
	case p == "/api/agent/config" || p == "/api/agents" || strings.HasPrefix(p, "/api/agents/"):
		return FeatureAgentEditor, required, true
	case strings.HasPrefix(p, "/api/agent/templates/"):
		return FeatureAgentTemplates, required, true
	case p == "/api/skills" || strings.HasPrefix(p, "/api/skills/"):
		return FeatureSkills, required, true
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
	case strings.HasPrefix(p, "/api/whatsapp/"):
		return FeatureWhatsAppInbox, required, true
	default:
		return "", required, false
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

func normalizePath(p string) string {
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimRight(p, "/")
}
