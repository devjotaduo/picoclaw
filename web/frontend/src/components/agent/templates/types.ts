export type TemplateCategory =
  | "customer_service"
  | "sales"
  | "support"
  | "internal"

export type TemplateTone = "formal" | "friendly" | "neutral"

export type TemplateLanguage = "pt-br" | "en" | "zh"

export type ConfidenceLevel = "low" | "medium" | "high"
export type PriorityLevel = "low" | "medium" | "high"
export type PermissionLevel =
  | "read_only"
  | "write_with_confirmation"
  | "write_allowed"

export type WeekDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"

export const WEEK_DAYS: readonly WeekDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

export interface CompanyDaySchedule {
  open: boolean
  from: string // "09:00"
  to: string // "18:00"
}

export interface CompanyScheduleStructured {
  monday: CompanyDaySchedule
  tuesday: CompanyDaySchedule
  wednesday: CompanyDaySchedule
  thursday: CompanyDaySchedule
  friday: CompanyDaySchedule
  saturday: CompanyDaySchedule
  sunday: CompanyDaySchedule
  notes: string
}

export interface TemplateCompanyInfo {
  name: string
  hours: string
  contact: string
  general_info: string
  schedule: CompanyScheduleStructured
}

export interface TemplateResponseExamples {
  greeting: string
  clarification: string
  unknown_answer: string
  routing: string
  closing: string
}

export interface TemplateStyleGuide {
  do: string[]
  dont: string[]
}

export interface TemplateFallbackPolicy {
  max_clarifying_questions: number
  when_unsure: string
  when_to_route: string[]
  route_message: string
}

export interface TemplateHandoffSummary {
  cliente: string
  contato: string
  motivo: string
  resumo: string
  dados_coletados: string
  urgencia: PriorityLevel | string
  setor_destino: string
  proxima_acao: string
}

export interface TemplateStructuredOutput {
  intent: string
  confidence: ConfidenceLevel | string
  collected_fields: Record<string, string>
  missing_fields: string[]
  needs_routing: boolean | string
  target_sector: string
  priority: PriorityLevel | string
  summary: string
  next_action: string
}

export interface TemplatePriorityRules {
  high: string[]
  medium: string[]
  low: string[]
}

export interface TemplateService {
  name: string
  details: string
  duration: string
  price: string
  show_price: boolean
}

export interface TemplateProfessional {
  name: string
  role: string
  bio: string
  services: TemplateService[]
}

export interface TemplateProduct {
  name: string
  details: string
  price: string
  show_price: boolean
}

export interface TemplateModules {
  professionals_enabled: boolean
  products_enabled: boolean
}

// TemplateSkillConfig is the per-template setting for an installed skill.
// `enabled` controls whether the skill is wired into the agent (frontmatter).
// `visible` controls whether it shows up as an advertised capability in the
// AGENT.md "Available Skills" section — only meaningful when enabled.
export interface TemplateSkillConfig {
  name: string
  enabled: boolean
  visible: boolean
}

// TemplateBehavior carries runtime behavioral toggles persisted as
// behavior.json in the agent workspace. The channel and agent layers enforce
// these as hard filters (drops before the LLM), not prompt instructions.
export interface TemplateBehavior {
  // Activation + where to respond
  master_enabled: boolean
  business_hours_only: boolean
  out_of_hours_reply: string
  respond_in_dm: boolean
  respond_in_groups: boolean
  group_mention_only: boolean
  keyword_trigger: string

  // Outbound-only
  outbound_only_mode: boolean
  ignore_other_bots: boolean
  ignore_forwarded_messages: boolean
  ignore_self_messages: boolean

  // Media gating
  process_images: boolean
  process_documents: boolean
  process_audio: boolean
  process_video: boolean
  process_stickers: boolean
  process_location: boolean
  max_media_size_mb: number

  // Scope / privacy / throttle / handoff
  session_timeout_minutes: number
  max_messages_per_session: number
  mask_pii_in_replies: boolean
  store_received_media: boolean
  max_messages_per_minute_per_user: number
  response_cooldown_seconds: number
  handoff_keywords: string[]
  handoff_after_failures: number
}

// DEFAULT_BEHAVIOR preserves the pre-feature runtime: everything enabled, no
// throttles, no filters. Apply this when initializing a fresh template draft.
export const DEFAULT_BEHAVIOR: TemplateBehavior = {
  master_enabled: true,
  business_hours_only: false,
  out_of_hours_reply: "",
  respond_in_dm: true,
  respond_in_groups: true,
  group_mention_only: false,
  keyword_trigger: "",
  outbound_only_mode: false,
  ignore_other_bots: false,
  ignore_forwarded_messages: false,
  ignore_self_messages: true,
  process_images: true,
  process_documents: true,
  process_audio: true,
  process_video: true,
  process_stickers: true,
  process_location: true,
  max_media_size_mb: 0,
  session_timeout_minutes: 0,
  max_messages_per_session: 0,
  mask_pii_in_replies: false,
  store_received_media: true,
  max_messages_per_minute_per_user: 0,
  response_cooldown_seconds: 0,
  handoff_keywords: [],
  handoff_after_failures: 0,
}

export interface AgentTemplate {
  id: string
  name: string
  icon: string
  category: TemplateCategory
  short_description: string
  presentation: string
  personality: string[]
  values: string[]
  functions: string[]
  prohibitions: string[]
  protections: string[]
  company_info: TemplateCompanyInfo
  language: TemplateLanguage
  tone: TemplateTone
  recommended_skills: string[]
  recommended_model?: string

  conversation_flow: string[]
  required_fields_by_intent: Record<string, string[]>
  response_examples: TemplateResponseExamples
  style_guide: TemplateStyleGuide
  fallback_policy: TemplateFallbackPolicy
  handoff_summary_template: TemplateHandoffSummary
  structured_output_template: TemplateStructuredOutput
  priority_rules: TemplatePriorityRules
  knowledge_policy: string[]
  security_rules: string[]
  quality_metrics: string[]

  modules: TemplateModules
  professionals: TemplateProfessional[]
  products: TemplateProduct[]

  recommended_tools: string[]
  tool_namespaces: string[]
  required_integrations: string[]
  permission_level: PermissionLevel
  approval_required_for: string[]
}

export interface TemplateApplyPayload {
  template_id: string
  name: string
  short_description: string
  presentation: string
  personality: string[]
  values: string[]
  functions: string[]
  prohibitions: string[]
  protections: string[]
  company_info: TemplateCompanyInfo
  language: TemplateLanguage
  tone: TemplateTone
  skill_configs: TemplateSkillConfig[]
  model?: string

  conversation_flow: string[]
  required_fields_by_intent: Record<string, string[]>
  response_examples: TemplateResponseExamples
  style_guide: TemplateStyleGuide
  fallback_policy: TemplateFallbackPolicy
  handoff_summary_template: TemplateHandoffSummary
  structured_output_template: TemplateStructuredOutput
  priority_rules: TemplatePriorityRules
  knowledge_policy: string[]
  security_rules: string[]
  quality_metrics: string[]

  modules: TemplateModules
  professionals: TemplateProfessional[]
  products: TemplateProduct[]

  recommended_tools: string[]
  tool_namespaces: string[]
  required_integrations: string[]
  permission_level: PermissionLevel
  approval_required_for: string[]

  behavior: TemplateBehavior
}

export interface TemplateApplyResponse {
  status: string
  agent_path: string
  soul_path: string
  behavior_path?: string
  reload?: string
}

export type TemplateLayoutMode = "grouped" | "grid"
