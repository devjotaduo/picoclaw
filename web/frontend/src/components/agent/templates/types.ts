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
  presentation: string
  personality: string[]
  values: string[]
  functions: string[]
  prohibitions: string[]
  protections: string[]
  company_info: TemplateCompanyInfo
  language: TemplateLanguage
  tone: TemplateTone
  skills: string[]
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
}

export interface TemplateApplyResponse {
  status: string
  agent_path: string
  soul_path: string
}

export type TemplateLayoutMode = "grouped" | "grid"
