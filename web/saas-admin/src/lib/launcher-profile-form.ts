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

export function buildFormFromSeed(
  _profile: Pick<LauncherProfile, "name" | "slug" | "description" | "is_default" | "role_policy">,
  _seed: SeedBundle,
): LauncherProfileForm {
  throw new Error("buildFormFromSeed not implemented");
}

export function buildSeedFromForm(_form: LauncherProfileForm): SeedBundle {
  throw new Error("buildSeedFromForm not implemented");
}

export function isFormDirty(form: LauncherProfileForm, baseline: LauncherProfileForm): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}
