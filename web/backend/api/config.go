package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"regexp"
	"strings"

	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/pkg/logger"
)

// registerConfigRoutes binds configuration management endpoints to the ServeMux.
func (h *Handler) registerConfigRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/config", h.handleGetConfig)
	mux.HandleFunc("PUT /api/config", h.handleUpdateConfig)
	mux.HandleFunc("PATCH /api/config", h.handlePatchConfig)
	mux.HandleFunc("POST /api/config/test-command-patterns", h.handleTestCommandPatterns)
}

func (h *Handler) applyRuntimeLogLevel() {
	if h.debug {
		logger.SetLevel(logger.DEBUG)
		return
	}
	logger.SetLevelFromString(config.ResolveGatewayLogLevel(h.configPath))
}

// channelsConfigChanged reports whether the channel section differs between
// two snapshots. We compare via JSON marshalling so secret fields, raw
// settings blobs and nested structs are all covered.
func channelsConfigChanged(oldCfg, newCfg *config.Config) bool {
	a, errA := json.Marshal(oldCfg.Channels)
	b, errB := json.Marshal(newCfg.Channels)
	if errA != nil || errB != nil {
		return true
	}
	return string(a) != string(b)
}

// restartGatewayIfChannelsChanged triggers a background gateway restart when
// channel config has been mutated by a save. Channel runtime state (the
// whatsmeow WebSocket, telegram poller, etc.) lives in the gateway process,
// so a launcher-side save alone cannot tear down an active session — without
// the restart the agent keeps replying on a channel the user just disabled.
// The restart is fire-and-forget; errors are logged and not surfaced to the
// HTTP response.
func (h *Handler) restartGatewayIfChannelsChanged(oldCfg, newCfg *config.Config) {
	if oldCfg == nil || newCfg == nil {
		return
	}
	if !channelsConfigChanged(oldCfg, newCfg) {
		return
	}
	go func() {
		if _, err := h.RestartGateway(); err != nil {
			logger.Warnf("auto-restart gateway after channel config change failed: %v", err)
		} else {
			logger.Infof("gateway restarted after channel config change")
		}
	}()
}

// handleGetConfig returns the complete system configuration.
//
//	GET /api/config
func (h *Handler) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(cfg); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// handleUpdateConfig updates the complete system configuration.
//
//	PUT /api/config
func (h *Handler) handleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Snapshot pre-save channel config so we can decide whether the gateway
	// needs a restart to actually disconnect/connect channels.
	oldCfg, _ := config.LoadConfig(h.configPath)

	var raw map[string]any
	if err = json.Unmarshal(body, &raw); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	if err = normalizeChannelArrayFields(raw); err != nil {
		http.Error(w, fmt.Sprintf("Invalid channel array field: %v", err), http.StatusBadRequest)
		return
	}
	enforceAllowedChannels(raw)
	normalizedBody, err := json.Marshal(raw)
	if err != nil {
		http.Error(w, "Failed to normalize config payload", http.StatusBadRequest)
		return
	}
	var cfg config.Config
	if err = json.Unmarshal(normalizedBody, &cfg); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	if execAllowRemoteOmitted(body) {
		cfg.Tools.Exec.AllowRemote = config.DefaultConfig().Tools.Exec.AllowRemote
	}

	// Load existing config and copy security credentials before validation,
	// so that security-managed fields (e.g. pico token) are available.
	err = cfg.SecurityCopyFrom(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to apply security config: %v", err), http.StatusInternalServerError)
		return
	}
	applyConfigSecretsFromMap(&cfg, raw)

	if errs := validateConfig(&cfg); len(errs) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"status": "validation_error",
			"errors": errs,
		})
		return
	}

	if err := config.SaveConfig(h.configPath, &cfg); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}

	h.applyRuntimeLogLevel()
	h.restartGatewayIfChannelsChanged(oldCfg, &cfg)
	logger.Infof("configuration updated successfully")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func execAllowRemoteOmitted(body []byte) bool {
	var raw struct {
		Tools *struct {
			Exec *struct {
				AllowRemote *bool `json:"allow_remote"`
			} `json:"exec"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return false
	}
	return raw.Tools == nil || raw.Tools.Exec == nil || raw.Tools.Exec.AllowRemote == nil
}

// handlePatchConfig partially updates the system configuration using JSON Merge Patch (RFC 7396).
// Only the fields present in the request body will be updated; all other fields remain unchanged.
//
//	PATCH /api/config
func (h *Handler) handlePatchConfig(w http.ResponseWriter, r *http.Request) {
	patchBody, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Validate the patch is valid JSON
	var patch map[string]any
	if err = json.Unmarshal(patchBody, &patch); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	// Load existing config and marshal to a map for merging
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to load config: %v", err), http.StatusInternalServerError)
		return
	}
	existing, err := json.Marshal(cfg)
	if err != nil {
		http.Error(w, "Failed to serialize current config", http.StatusInternalServerError)
		return
	}

	var base map[string]any
	if err = json.Unmarshal(existing, &base); err != nil {
		http.Error(w, "Failed to parse current config", http.StatusInternalServerError)
		return
	}

	// Recursively merge patch into base
	mergeMap(base, patch)
	if err = normalizeChannelArrayFields(base); err != nil {
		http.Error(w, fmt.Sprintf("Invalid channel array field: %v", err), http.StatusBadRequest)
		return
	}
	enforceAllowedChannels(base)

	// Convert merged map back to Config struct
	merged, err := json.Marshal(base)
	if err != nil {
		http.Error(w, "Failed to serialize merged config", http.StatusInternalServerError)
		return
	}

	var newCfg config.Config
	if err = json.Unmarshal(merged, &newCfg); err != nil {
		http.Error(w, fmt.Sprintf("Merged config is invalid: %v", err), http.StatusBadRequest)
		return
	}

	// Restore security fields (tokens/keys) from the loaded config before validation,
	// because private fields are lost during JSON round-trip.
	if err = newCfg.SecurityCopyFrom(h.configPath); err != nil {
		http.Error(w, fmt.Sprintf("Failed to apply security config: %v", err), http.StatusInternalServerError)
		return
	}
	applyConfigSecretsFromMap(&newCfg, base)

	if errs := validateConfig(&newCfg); len(errs) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"status": "validation_error",
			"errors": errs,
		})
		return
	}

	if err := config.SaveConfig(h.configPath, &newCfg); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save config: %v", err), http.StatusInternalServerError)
		return
	}

	h.applyRuntimeLogLevel()
	h.restartGatewayIfChannelsChanged(cfg, &newCfg)
	logger.Infof("configuration updated successfully")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// handleTestCommandPatterns tests a command against whitelist and blacklist patterns.
//
//	POST /api/config/test-command-patterns
func (h *Handler) handleTestCommandPatterns(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req struct {
		AllowPatterns []string `json:"allow_patterns"`
		DenyPatterns  []string `json:"deny_patterns"`
		Command       string   `json:"command"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	lower := strings.ToLower(strings.TrimSpace(req.Command))

	type result struct {
		Allowed          bool    `json:"allowed"`
		Blocked          bool    `json:"blocked"`
		MatchedWhitelist *string `json:"matched_whitelist,omitempty"`
		MatchedBlacklist *string `json:"matched_blacklist,omitempty"`
	}

	resp := result{Allowed: false, Blocked: false}

	// Check whitelist first
	for _, pattern := range req.AllowPatterns {
		re, err := regexp.Compile(pattern)
		if err != nil {
			continue // skip invalid patterns
		}
		if re.MatchString(lower) {
			resp.Allowed = true
			resp.MatchedWhitelist = &pattern
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
	}

	// Check blacklist
	for _, pattern := range req.DenyPatterns {
		re, err := regexp.Compile(pattern)
		if err != nil {
			continue
		}
		if re.MatchString(lower) {
			resp.Blocked = true
			resp.MatchedBlacklist = &pattern
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// validateConfig checks the config for common errors before saving.
// Returns a list of human-readable error strings; empty means valid.
func validateConfig(cfg *config.Config) []string {
	var errs []string

	// Validate model_list entries
	if err := cfg.ValidateModelList(); err != nil {
		errs = append(errs, err.Error())
	}

	// Gateway port range
	if cfg.Gateway.Port != 0 && (cfg.Gateway.Port < 1 || cfg.Gateway.Port > 65535) {
		errs = append(errs, fmt.Sprintf("gateway.port %d is out of valid range (1-65535)", cfg.Gateway.Port))
	}

	// Pico channel: token required when enabled
	{
		bc := cfg.Channels.GetByType(config.ChannelPico)
		if bc != nil && bc.Enabled {
			if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
				if c, ok := decoded.(*config.PicoSettings); ok && c.Token.String() == "" {
					errs = append(errs, "channels.pico.token is required when pico channel is enabled")
				}
			}
		}
	}

	// Telegram: token required when enabled
	{
		bc := cfg.Channels.GetByType(config.ChannelTelegram)
		if bc != nil && bc.Enabled {
			if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
				if c, ok := decoded.(*config.TelegramSettings); ok && c.Token.String() == "" {
					errs = append(errs, "channels.telegram.token is required when telegram channel is enabled")
				}
			}
		}
	}

	// Discord: token required when enabled
	{
		bc := cfg.Channels.GetByType(config.ChannelDiscord)
		if bc != nil && bc.Enabled {
			if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
				if c, ok := decoded.(*config.DiscordSettings); ok && c.Token.String() == "" {
					errs = append(errs, "channels.discord.token is required when discord channel is enabled")
				}
			}
		}
	}

	{
		bc := cfg.Channels.GetByType(config.ChannelWeCom)
		if bc != nil && bc.Enabled {
			if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
				if c, ok := decoded.(*config.WeComSettings); ok {
					if c.BotID == "" {
						errs = append(errs, "channels.wecom.bot_id is required when wecom channel is enabled")
					}
					if c.Secret.String() == "" {
						errs = append(errs, "channels.wecom.secret is required when wecom channel is enabled")
					}
				}
			}
		}
	}

	if cfg.Tools.Exec.Enabled {
		if cfg.Tools.Exec.EnableDenyPatterns {
			errs = append(
				errs,
				validateRegexPatterns("tools.exec.custom_deny_patterns", cfg.Tools.Exec.CustomDenyPatterns)...)
		}
		errs = append(
			errs,
			validateRegexPatterns("tools.exec.custom_allow_patterns", cfg.Tools.Exec.CustomAllowPatterns)...)
	}

	return errs
}

func validateRegexPatterns(field string, patterns []string) []string {
	var errs []string
	for index, pattern := range patterns {
		if _, err := regexp.Compile(pattern); err != nil {
			errs = append(errs, fmt.Sprintf("%s[%d] is not a valid regular expression: %v", field, index, err))
		}
	}
	return errs
}

// mergeMap recursively merges src into dst (JSON Merge Patch semantics).
// - If a key in src has a null value, it is deleted from dst.
// - If both dst and src have a nested object for the same key, merge recursively.
// - Otherwise the value from src overwrites dst.
func mergeMap(dst, src map[string]any) {
	for key, srcVal := range src {
		if srcVal == nil {
			delete(dst, key)
			continue
		}
		srcMap, srcIsMap := srcVal.(map[string]any)
		dstMap, dstIsMap := dst[key].(map[string]any)
		if srcIsMap && dstIsMap {
			mergeMap(dstMap, srcMap)
		} else {
			dst[key] = srcVal
		}
	}
}

func asMapField(value map[string]any, key string) (map[string]any, bool) {
	raw, exists := value[key]
	if !exists {
		return nil, false
	}
	m, isMap := raw.(map[string]any)
	return m, isMap
}

var (
	allowFromHiddenCharsRe = regexp.MustCompile("[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]")
	allowFromSplitRe       = regexp.MustCompile("[,\uFF0C、;；\r\n\t]+")
	conservativeSplitRe    = regexp.MustCompile("[,\uFF0C\r\n\t]+")
)

type stringArrayParserOptions struct {
	stripHiddenChars bool
}

func normalizeChannelArrayFields(raw map[string]any) error {
	channelsMap, hasChannels := asMapField(raw, "channel_list")
	if !hasChannels {
		return nil
	}

	defaultCfg := config.DefaultConfig()
	for channelName, rawChannel := range channelsMap {
		chMap, ok := rawChannel.(map[string]any)
		if !ok {
			continue
		}

		if rawAllowFrom, exists := chMap["allow_from"]; exists {
			normalized, err := normalizeStringArrayValue(rawAllowFrom, stringArrayParserOptions{
				stripHiddenChars: true,
			})
			if err != nil {
				return fmt.Errorf("channel_list.%s.allow_from: %w", channelName, err)
			}
			chMap["allow_from"] = normalized
		}

		if groupTrigger, ok := asMapField(chMap, "group_trigger"); ok {
			if rawPrefixes, exists := groupTrigger["prefixes"]; exists {
				normalized, err := normalizeStringArrayValue(rawPrefixes, stringArrayParserOptions{})
				if err != nil {
					return fmt.Errorf("channel_list.%s.group_trigger.prefixes: %w", channelName, err)
				}
				groupTrigger["prefixes"] = normalized
			}
		}

		settingsMap, hasSettings := asMapField(chMap, "settings")
		if !hasSettings {
			continue
		}

		settingsType := channelSettingsType(defaultCfg, channelName, chMap)
		if settingsType == nil {
			continue
		}

		for i := range settingsType.NumField() {
			field := settingsType.Field(i)
			if !field.IsExported() || !isStringSliceType(field.Type) {
				continue
			}
			jsonKey := strings.Split(field.Tag.Get("json"), ",")[0]
			if jsonKey == "" || jsonKey == "-" {
				continue
			}
			rawValue, exists := settingsMap[jsonKey]
			if !exists {
				continue
			}

			options := stringArrayParserOptions{}
			if jsonKey == "allow_from" {
				options.stripHiddenChars = true
			}
			normalized, err := normalizeStringArrayValue(rawValue, options)
			if err != nil {
				return fmt.Errorf("channel_list.%s.settings.%s: %w", channelName, jsonKey, err)
			}
			settingsMap[jsonKey] = normalized
		}
	}
	return nil
}

func enforceAllowedChannels(raw map[string]any) {
	if _, restricted := allowedChannelNames(); !restricted {
		return
	}
	catalog := effectiveChannelCatalog()
	channelsMap, hasChannels := asMapField(raw, "channel_list")
	if !hasChannels {
		channelsMap = map[string]any{}
		raw["channel_list"] = channelsMap
	}

	allowedByConfigKey := make(map[string]channelCatalogItem, len(catalog))
	for _, item := range catalog {
		allowedByConfigKey[item.ConfigKey] = item
	}

	for channelName, rawChannel := range channelsMap {
		chMap, ok := rawChannel.(map[string]any)
		if !ok {
			chMap = map[string]any{}
			channelsMap[channelName] = chMap
		}
		item, ok := allowedByConfigKey[channelName]
		if !ok {
			chMap["enabled"] = false
			continue
		}
		configureAllowedChannel(chMap, item)
	}

	for _, item := range catalog {
		if _, ok := channelsMap[item.ConfigKey]; ok {
			continue
		}
		chMap := map[string]any{}
		configureAllowedChannel(chMap, item)
		channelsMap[item.ConfigKey] = chMap
	}
}

func enforceAllowedChannelsConfig(cfg *config.Config) bool {
	if _, restricted := allowedChannelNames(); !restricted || cfg == nil {
		return false
	}
	changed := false
	if cfg.Channels == nil {
		cfg.Channels = config.ChannelsConfig{}
		changed = true
	}

	catalog := effectiveChannelCatalog()
	allowedByConfigKey := make(map[string]channelCatalogItem, len(catalog))
	for _, item := range catalog {
		allowedByConfigKey[item.ConfigKey] = item
	}

	for channelName, ch := range cfg.Channels {
		if _, ok := allowedByConfigKey[channelName]; ok || ch == nil {
			continue
		}
		if ch.Enabled {
			ch.Enabled = false
			changed = true
		}
	}

	for _, item := range catalog {
		ch := cfg.Channels[item.ConfigKey]
		if ch == nil {
			ch = &config.Channel{}
			cfg.Channels[item.ConfigKey] = ch
			changed = true
		}
		if configureAllowedChannelConfig(ch, item) {
			changed = true
		}
	}
	return changed
}

func configureAllowedChannel(chMap map[string]any, item channelCatalogItem) {
	chMap["enabled"] = true
	if item.Name != "" {
		chMap["type"] = item.Name
	} else {
		chMap["type"] = item.ConfigKey
	}

	if item.Name != "whatsapp" && item.Name != "whatsapp_native" {
		return
	}
	settings := map[string]any{}
	if existing, ok := chMap["settings"].(map[string]any); ok {
		settings = existing
	}
	if item.Name == "whatsapp_native" {
		settings["use_native"] = true
		settings["bridge_url"] = ""
	} else {
		settings["use_native"] = false
	}
	chMap["settings"] = settings
}

func configureAllowedChannelConfig(ch *config.Channel, item channelCatalogItem) bool {
	changed := false
	if !ch.Enabled {
		ch.Enabled = true
		changed = true
	}

	wantType := item.Name
	if wantType == "" {
		wantType = item.ConfigKey
	}
	if ch.Type != wantType {
		ch.Type = wantType
		changed = true
	}

	if item.Name != config.ChannelWhatsApp && item.Name != config.ChannelWhatsAppNative {
		return changed
	}
	decoded, err := ch.GetDecoded()
	if err == nil {
		if settings, ok := decoded.(*config.WhatsAppSettings); ok {
			wantNative := item.Name == config.ChannelWhatsAppNative
			if settings.UseNative != wantNative {
				settings.UseNative = wantNative
				changed = true
			}
			if wantNative && settings.BridgeURL != "" {
				settings.BridgeURL = ""
				changed = true
			}
			return changed
		}
	}

	settings := map[string]any{}
	if len(ch.Settings) > 0 {
		_ = json.Unmarshal(ch.Settings, &settings)
	}
	wantNative := item.Name == config.ChannelWhatsAppNative
	if settings["use_native"] != wantNative {
		settings["use_native"] = wantNative
		changed = true
	}
	if wantNative && settings["bridge_url"] != "" {
		settings["bridge_url"] = ""
		changed = true
	}
	if changed {
		if raw, err := json.Marshal(settings); err == nil {
			ch.Settings = config.RawNode(raw)
		}
	}
	return changed
}

func channelSettingsType(
	defaultCfg *config.Config,
	channelName string,
	channelMap map[string]any,
) reflect.Type {
	if channelType, _ := channelMap["type"].(string); channelType != "" {
		if bc := defaultCfg.Channels.GetByType(channelType); bc != nil {
			if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
				return derefType(reflect.TypeOf(decoded))
			}
		}
	}

	if bc := defaultCfg.Channels.Get(channelName); bc != nil {
		if decoded, err := bc.GetDecoded(); err == nil && decoded != nil {
			return derefType(reflect.TypeOf(decoded))
		}
	}

	return nil
}

func derefType(typ reflect.Type) reflect.Type {
	for typ != nil && typ.Kind() == reflect.Ptr {
		typ = typ.Elem()
	}
	return typ
}

func isStringSliceType(typ reflect.Type) bool {
	typ = derefType(typ)
	return typ != nil && typ.Kind() == reflect.Slice && typ.Elem().Kind() == reflect.String
}

func normalizeStringArrayValue(value any, options stringArrayParserOptions) ([]string, error) {
	switch typed := value.(type) {
	case nil:
		return nil, nil
	case string:
		return parseStringArrayValue(typed, options), nil
	case float64:
		return normalizeStringArrayItems([]string{fmt.Sprintf("%.0f", typed)}, options), nil
	case []string:
		return normalizeStringArrayItems(typed, options), nil
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			switch raw := item.(type) {
			case string:
				items = append(items, raw)
			case float64:
				items = append(items, fmt.Sprintf("%.0f", raw))
			default:
				return nil, fmt.Errorf("unsupported list item type %T", item)
			}
		}
		return normalizeStringArrayItems(items, options), nil
	default:
		return nil, fmt.Errorf("unsupported list field type %T", value)
	}
}

func parseStringArrayValue(raw string, options stringArrayParserOptions) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	splitRe := conservativeSplitRe
	if options.stripHiddenChars {
		splitRe = allowFromSplitRe
	}
	return normalizeStringArrayItems(splitRe.Split(raw, -1), options)
}

func normalizeStringArrayItems(items []string, options stringArrayParserOptions) []string {
	result := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		normalized := item
		if options.stripHiddenChars {
			normalized = allowFromHiddenCharsRe.ReplaceAllString(normalized, "")
		}
		normalized = strings.TrimSpace(normalized)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	if len(result) == 0 {
		return []string{}
	}
	return result
}

func getSecretString(m map[string]any, key string) (string, bool) {
	if raw, exists := m[key]; exists {
		s, isString := raw.(string)
		if isString {
			return s, true
		}
	}
	if raw, exists := m["_"+key]; exists {
		s, isString := raw.(string)
		if isString {
			return s, true
		}
	}
	return "", false
}

func applyConfigSecretsFromMap(cfg *config.Config, raw map[string]any) {
	channelsMap, hasChannels := asMapField(raw, "channel_list")
	if !hasChannels {
		return
	}

	for chName, chData := range channelsMap {
		chMap, ok := chData.(map[string]any)
		if !ok {
			continue
		}
		bc := cfg.Channels.Get(chName)
		if bc == nil {
			continue
		}
		decoded, err := bc.GetDecoded()
		if err != nil || decoded == nil {
			continue
		}
		rv := reflect.ValueOf(decoded)
		if rv.Kind() == reflect.Ptr {
			rv = rv.Elem()
		}
		if rv.Kind() != reflect.Struct {
			continue
		}
		// Channel-specific settings live under the "settings" key in the raw map
		settingsMap := chMap
		if sm, hasSettings := asMapField(chMap, "settings"); hasSettings {
			settingsMap = sm
		}
		applySecureStringsToStruct(rv, settingsMap)
	}

	// Handle tools secrets
	tools, hasTools := asMapField(raw, "tools")
	if !hasTools {
		return
	}
	skills, hasSkills := asMapField(tools, "skills")
	if !hasSkills {
		return
	}
	if github, hasGithub := asMapField(skills, "github"); hasGithub {
		if token, hasToken := getSecretString(github, "token"); hasToken {
			cfg.Tools.Skills.Github.Token.Set(token)
		}
	}
	if registries, hasRegistries := asMapField(skills, "registries"); hasRegistries {
		for registryName, rawRegistry := range registries {
			registryMap, ok := rawRegistry.(map[string]any)
			if !ok {
				continue
			}
			if authToken, hasAuthToken := getSecretString(registryMap, "auth_token"); hasAuthToken {
				registryCfg, _ := cfg.Tools.Skills.Registries.Get(registryName)
				registryCfg.AuthToken.Set(authToken)
				cfg.Tools.Skills.Registries.Set(registryName, registryCfg)
			}
		}
		return
	}

	registriesList, hasRegistries := skills["registries"].([]any)
	if !hasRegistries {
		return
	}
	for _, rawRegistry := range registriesList {
		registryMap, ok := rawRegistry.(map[string]any)
		if !ok {
			continue
		}
		name, _ := registryMap["name"].(string)
		if name == "" {
			continue
		}
		if authToken, hasAuthToken := getSecretString(registryMap, "auth_token"); hasAuthToken {
			registryCfg, _ := cfg.Tools.Skills.Registries.Get(name)
			registryCfg.AuthToken.Set(authToken)
			cfg.Tools.Skills.Registries.Set(name, registryCfg)
		}
	}
}

// applySecureStringsToStruct walks a struct and applies SecureString fields
// from the matching keys in rawMap. It recurses into nested maps and slices.
func applySecureStringsToStruct(rv reflect.Value, rawMap map[string]any) {
	rt := rv.Type()
	for jsonKey, rawVal := range rawMap {
		for i := range rt.NumField() {
			f := rt.Field(i)
			if !f.IsExported() {
				continue
			}
			tag := f.Tag.Get("json")
			name := strings.Split(tag, ",")[0]
			if name != jsonKey {
				continue
			}
			sf := rv.Field(i)
			if !sf.CanSet() {
				continue
			}
			// Direct SecureString field
			if s, ok := rawVal.(string); ok {
				if f.Type == reflect.TypeOf(config.SecureString{}) {
					sf.Set(reflect.ValueOf(*config.NewSecureString(s)))
				} else if f.Type == reflect.TypeOf(&config.SecureString{}) {
					sf.Set(reflect.ValueOf(config.NewSecureString(s)))
				}
				continue
			}
			// Recurse into nested struct
			if sf.Kind() == reflect.Struct {
				if nested, ok := rawVal.(map[string]any); ok {
					applySecureStringsToStruct(sf, nested)
				}
				continue
			}
			// Recurse into map fields (e.g., map[string]SomeStruct)
			if sf.Kind() == reflect.Map && sf.Type().Elem().Kind() == reflect.Struct {
				if nestedMap, ok := rawVal.(map[string]any); ok {
					for mapKey, mapVal := range nestedMap {
						nested, ok := mapVal.(map[string]any)
						if !ok {
							continue
						}
						elemType := sf.Type().Elem()
						// Get existing element or create a new zero value
						var elem reflect.Value
						existing := sf.MapIndex(reflect.ValueOf(mapKey))
						if existing.IsValid() {
							if existing.Kind() == reflect.Interface {
								existing = existing.Elem()
							}
							if existing.Kind() == reflect.Ptr && !existing.IsNil() {
								elem = reflect.New(elemType)
								elem.Elem().Set(existing.Elem())
							} else if existing.Kind() == reflect.Struct {
								elem = reflect.New(elemType)
								elem.Elem().Set(existing)
							}
						}
						if !elem.IsValid() {
							elem = reflect.New(elemType)
						}
						applySecureStringsToStruct(elem.Elem(), nested)
						sf.SetMapIndex(reflect.ValueOf(mapKey), elem.Elem())
					}
				}
				continue
			}
			// Recurse into slice elements that are structs
			if sf.Kind() == reflect.Slice && sf.Type().Elem().Kind() == reflect.Struct {
				if sliceRaw, ok := rawVal.([]any); ok {
					for idx, elemRaw := range sliceRaw {
						if nested, ok := elemRaw.(map[string]any); ok {
							if idx < sf.Len() {
								applySecureStringsToStruct(sf.Index(idx), nested)
							}
						}
					}
				}
			}
		}
	}
}
