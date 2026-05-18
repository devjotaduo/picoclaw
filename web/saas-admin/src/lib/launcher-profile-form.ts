import type { LauncherProfile, RolePolicy } from "@/api/launcher-profiles";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export interface AgentForm {
  id: string;
  name: string;
  model: string;
  default: boolean;
  avatar: AgentAvatar;
  roleKind: string;
  description: string;
  skills: string[];
  workspace: string;
  subagentsAllow: string[];
  /** raw role_config + access JSON kept as text for round-trip preservation. */
  extrasJSON: string;
}

export interface AgentAvatar {
  type: "preset" | "upload";
  icon: string;
  initials: string;
  background: string;
  foreground: string;
}

export interface ChannelToggle {
  enabled: boolean;
}

export interface WhatsAppChannelForm extends ChannelToggle {
  useNative: boolean;
  bridgeURL: string;
  sessionStorePath: string;
}

export interface TelegramChannelForm extends ChannelToggle {
  baseURL: string;
  proxy: string;
  useMarkdownV2: boolean;
  typingEnabled: boolean;
  placeholderEnabled: boolean;
  placeholderText: string;
}

export interface MatrixChannelForm extends ChannelToggle {
  homeserver: string;
  userID: string;
  joinOnInvite: boolean;
  mentionOnly: boolean;
}

export interface ScheduleEntry {
  open: boolean;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export interface BehaviorForm {
  masterEnabled: boolean;
  respondInDM: boolean;
  respondInGroups: boolean;
  groupMentionOnly: boolean;
  ignoreOtherBots: boolean;
  ignoreSelfMessages: boolean;
  ignoreForwardedMessages: boolean;
  processAudio: boolean;
  processDocuments: boolean;
  processImages: boolean;
  processLocation: boolean;
  processStickers: boolean;
  processVideo: boolean;
  storeReceivedMedia: boolean;
  maskPIIInReplies: boolean;
  outboundOnlyMode: boolean;
  businessHoursOnly: boolean;
  scheduleNotes: string;
  schedule: Record<Weekday, ScheduleEntry>;
}

export interface DisplayForm {
  showModelSelector: boolean;
  showReasoning: boolean;
  showToolCalls: boolean;
}

export interface ModelForm {
  id: string;
  provider: string;
  modelName: string;
  model: string;
  apiBase: string;
  enabled: boolean;
  /** Raw extra fields (api_keys, extra_body, auth_method, etc.) preserved verbatim. */
  extrasJSON: string;
}

export interface ChannelsForm {
  whatsapp: WhatsAppChannelForm;
  telegram: TelegramChannelForm;
  matrix: MatrixChannelForm;
  /** Raw JSON for everything not surfaced as structured fields. Object keyed by channel id. */
  othersJSON: string;
}

export interface LauncherProfileForm {
  // Metadata (matches /api/admin/launcher-profiles PATCH body)
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;

  // Role policy
  rolePolicy: RolePolicy;
  rolePolicyMode: "visual" | "json";
  rolePolicyText: string;
  rolePolicyTextError: string | null;

  // Seed
  agents: AgentForm[];
  channels: ChannelsForm;
  behavior: BehaviorForm;
  display: DisplayForm;
  models: ModelForm[];

  agentMD: string;
  soulMD: string;

  // Snapshots of the entire seed for round-trip preservation of unknown keys.
  configBaseline: Record<string, unknown>;
  behaviorBaseline: Record<string, unknown>;
}

export const EMPTY_BEHAVIOR: BehaviorForm = {
  masterEnabled: true,
  respondInDM: true,
  respondInGroups: false,
  groupMentionOnly: true,
  ignoreOtherBots: true,
  ignoreSelfMessages: true,
  ignoreForwardedMessages: false,
  processAudio: true,
  processDocuments: true,
  processImages: true,
  processLocation: true,
  processStickers: true,
  processVideo: true,
  storeReceivedMedia: true,
  maskPIIInReplies: true,
  outboundOnlyMode: false,
  businessHoursOnly: false,
  scheduleNotes: "",
  schedule: Object.fromEntries(
    WEEKDAYS.map((d) => [d, { open: true, from: "08:00", to: "18:00" }]),
  ) as Record<Weekday, ScheduleEntry>,
};

export interface SeedBundle {
  config_json: Record<string, unknown>;
  agent_md: string;
  soul_md: string;
  behavior_json: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

const DEFAULT_AVATAR: AgentAvatar = {
  type: "preset",
  icon: "headset",
  initials: "??",
  background: "#2563eb",
  foreground: "#ffffff",
};

function readAvatar(value: unknown): AgentAvatar {
  const r = asRecord(value);
  const type = asString(r.type, DEFAULT_AVATAR.type);
  return {
    type: type === "upload" ? "upload" : "preset",
    icon: asString(r.icon, DEFAULT_AVATAR.icon),
    initials: asString(r.initials, DEFAULT_AVATAR.initials),
    background: asString(r.background, DEFAULT_AVATAR.background),
    foreground: asString(r.foreground, DEFAULT_AVATAR.foreground),
  };
}

function readAgents(configJSON: Record<string, unknown>): AgentForm[] {
  const list = asArray(asRecord(asRecord(configJSON).agents).list);
  return list.map((raw, idx) => {
    const r = asRecord(raw);
    const roleConfig = asRecord(r.role_config);
    const subagents = asRecord(r.subagents);
    const access = asRecord(r.access);
    return {
      id: asString(r.id, `agent-${idx}`),
      name: asString(r.name, ""),
      model: asString(r.model, ""),
      default: asBoolean(r.default, false),
      avatar: readAvatar(r.avatar),
      roleKind: asString(roleConfig.kind, "custom"),
      description: asString(roleConfig.description, ""),
      skills: asStringArray(r.skills),
      workspace: asString(r.workspace, ""),
      subagentsAllow: asStringArray(subagents.allow_agents),
      extrasJSON: JSON.stringify(
        { role_config: roleConfig, access, subagents },
        null,
        2,
      ),
    };
  });
}

function readBehavior(behaviorJSON: Record<string, unknown>): BehaviorForm {
  const b = behaviorJSON;
  const schedule = asRecord(b.schedule);
  const builtSchedule = {} as Record<Weekday, ScheduleEntry>;
  for (const day of WEEKDAYS) {
    const entry = asRecord(schedule[day]);
    builtSchedule[day] = {
      open: asBoolean(entry.open, EMPTY_BEHAVIOR.schedule[day].open),
      from: asString(entry.from, EMPTY_BEHAVIOR.schedule[day].from),
      to: asString(entry.to, EMPTY_BEHAVIOR.schedule[day].to),
    };
  }
  return {
    masterEnabled: asBoolean(b.master_enabled, EMPTY_BEHAVIOR.masterEnabled),
    respondInDM: asBoolean(b.respond_in_dm, EMPTY_BEHAVIOR.respondInDM),
    respondInGroups: asBoolean(b.respond_in_groups, EMPTY_BEHAVIOR.respondInGroups),
    groupMentionOnly: asBoolean(b.group_mention_only, EMPTY_BEHAVIOR.groupMentionOnly),
    ignoreOtherBots: asBoolean(b.ignore_other_bots, EMPTY_BEHAVIOR.ignoreOtherBots),
    ignoreSelfMessages: asBoolean(b.ignore_self_messages, EMPTY_BEHAVIOR.ignoreSelfMessages),
    ignoreForwardedMessages: asBoolean(
      b.ignore_forwarded_messages,
      EMPTY_BEHAVIOR.ignoreForwardedMessages,
    ),
    processAudio: asBoolean(b.process_audio, EMPTY_BEHAVIOR.processAudio),
    processDocuments: asBoolean(b.process_documents, EMPTY_BEHAVIOR.processDocuments),
    processImages: asBoolean(b.process_images, EMPTY_BEHAVIOR.processImages),
    processLocation: asBoolean(b.process_location, EMPTY_BEHAVIOR.processLocation),
    processStickers: asBoolean(b.process_stickers, EMPTY_BEHAVIOR.processStickers),
    processVideo: asBoolean(b.process_video, EMPTY_BEHAVIOR.processVideo),
    storeReceivedMedia: asBoolean(
      b.store_received_media,
      EMPTY_BEHAVIOR.storeReceivedMedia,
    ),
    maskPIIInReplies: asBoolean(b.mask_pii_in_replies, EMPTY_BEHAVIOR.maskPIIInReplies),
    outboundOnlyMode: asBoolean(b.outbound_only_mode, EMPTY_BEHAVIOR.outboundOnlyMode),
    businessHoursOnly: asBoolean(b.business_hours_only, EMPTY_BEHAVIOR.businessHoursOnly),
    scheduleNotes: asString(schedule.notes, ""),
    schedule: builtSchedule,
  };
}

function readDisplay(configJSON: Record<string, unknown>): DisplayForm {
  const ui = asRecord(configJSON.ui);
  return {
    showModelSelector: asBoolean(ui.show_model_selector, true),
    showReasoning: asBoolean(ui.show_reasoning, true),
    showToolCalls: asBoolean(ui.show_tool_calls, true),
  };
}

function readModels(configJSON: Record<string, unknown>): ModelForm[] {
  const list = asArray(configJSON.model_list);
  return list.map((raw, idx) => {
    const r = asRecord(raw);
    const { provider, model_name, model, api_base, enabled, ...extras } = r;
    return {
      id: `${asString(model_name, "model")}-${idx}`,
      provider: asString(provider, ""),
      modelName: asString(model_name, ""),
      model: asString(model, ""),
      apiBase: asString(api_base, ""),
      enabled: asBoolean(enabled, true),
      extrasJSON: JSON.stringify(extras, null, 2),
    };
  });
}

function readChannels(configJSON: Record<string, unknown>): ChannelsForm {
  const cl = asRecord(configJSON.channel_list);
  const wa = asRecord(cl.whatsapp);
  const waSettings = asRecord(wa.settings);
  const tg = asRecord(cl.telegram);
  const tgSettings = asRecord(tg.settings);
  const tgPlaceholder = asRecord(tg.placeholder);
  const tgTyping = asRecord(tg.typing);
  const mx = asRecord(cl.matrix);
  const mxSettings = asRecord(mx.settings);
  const mxGroupTrigger = asRecord(mx.group_trigger);
  const others: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cl)) {
    if (key !== "whatsapp" && key !== "telegram" && key !== "matrix") {
      others[key] = value;
    }
  }
  return {
    whatsapp: {
      enabled: asBoolean(wa.enabled, false),
      useNative: asBoolean(waSettings.use_native, true),
      bridgeURL: asString(waSettings.bridge_url, ""),
      sessionStorePath: asString(waSettings.session_store_path, ""),
    },
    telegram: {
      enabled: asBoolean(tg.enabled, false),
      baseURL: asString(tgSettings.base_url, ""),
      proxy: asString(tgSettings.proxy, ""),
      useMarkdownV2: asBoolean(tgSettings.use_markdown_v2, false),
      typingEnabled: asBoolean(tgTyping.enabled, true),
      placeholderEnabled: asBoolean(tgPlaceholder.enabled, false),
      placeholderText: asArray(tgPlaceholder.text).join("\n"),
    },
    matrix: {
      enabled: asBoolean(mx.enabled, false),
      homeserver: asString(mxSettings.homeserver, "https://matrix.org"),
      userID: asString(mxSettings.user_id, ""),
      joinOnInvite: asBoolean(mxSettings.join_on_invite, true),
      mentionOnly: asBoolean(mxGroupTrigger.mention_only, true),
    },
    othersJSON: JSON.stringify(others, null, 2),
  };
}

export function buildFormFromSeed(
  profile: Pick<LauncherProfile, "name" | "slug" | "description" | "is_default" | "role_policy">,
  seed: SeedBundle,
): LauncherProfileForm {
  const rolePolicy = (profile.role_policy ?? {}) as RolePolicy;
  return {
    name: profile.name,
    slug: profile.slug,
    description: profile.description,
    isDefault: profile.is_default,
    rolePolicy,
    rolePolicyMode: "visual",
    rolePolicyText: JSON.stringify(rolePolicy, null, 2),
    rolePolicyTextError: null,
    agents: readAgents(seed.config_json),
    channels: readChannels(seed.config_json),
    behavior: readBehavior(seed.behavior_json),
    display: readDisplay(seed.config_json),
    models: readModels(seed.config_json),
    agentMD: seed.agent_md,
    soulMD: seed.soul_md,
    configBaseline: seed.config_json,
    behaviorBaseline: seed.behavior_json,
  };
}

export function buildSeedFromForm(_form: LauncherProfileForm): SeedBundle {
  throw new Error("buildSeedFromForm not implemented");
}

export function isFormDirty(form: LauncherProfileForm, baseline: LauncherProfileForm): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}
