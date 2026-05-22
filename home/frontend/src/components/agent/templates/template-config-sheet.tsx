import {
  IconBolt,
  IconBook2,
  IconCalendarStats,
  IconCheck,
  IconLoader2,
  IconPackage,
  IconPhoto,
  IconPlus,
  IconPower,
  IconSend,
  IconShieldLock,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { SkillSupportItem } from "@/api/skills"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { EditableList } from "./editable-list"
import { ProductsEditor } from "./products-editor"
import { ProfessionalsEditor } from "./professionals-editor"
import { ScheduleEditor } from "./schedule-editor"
import { TemplateIcon } from "./template-icon"
import type {
  AgentTemplate,
  CompanyScheduleStructured,
  EmojiPolicy,
  PermissionLevel,
  TemplateApplyPayload,
  TemplateBehavior,
  TemplateFallbackPolicy,
  TemplateKnowledgeBase,
  TemplateKnowledgeBaseFAQ,
  TemplateLanguage,
  TemplateModules,
  TemplatePriorityRules,
  TemplateResponseExamples,
  TemplateSkillConfig,
  TemplateStyleGuide,
  TemplateTone,
} from "./types"

interface TemplateConfigSheetProps {
  open: boolean
  template: AgentTemplate | null
  draft: TemplateApplyPayload | null
  isApplying: boolean
  isSavingTemplate: boolean
  isResettingTemplate: boolean
  hasSavedOverride: boolean
  installedSkills: SkillSupportItem[]
  onDraftChange: (draft: TemplateApplyPayload) => void
  onApply: () => void
  onSaveTemplate: () => void
  onResetTemplate: () => void
  onOpenChange: (open: boolean) => void
}

export function TemplateConfigSheet({
  open,
  template,
  draft,
  isApplying,
  isSavingTemplate,
  isResettingTemplate,
  hasSavedOverride,
  installedSkills,
  onDraftChange,
  onApply,
  onSaveTemplate,
  onResetTemplate,
  onOpenChange,
}: TemplateConfigSheetProps) {
  const { t } = useTranslation()

  function update<K extends keyof TemplateApplyPayload>(
    key: K,
    value: TemplateApplyPayload[K],
  ) {
    if (!draft) return
    onDraftChange({ ...draft, [key]: value })
  }

  function updateCompany<K extends keyof TemplateApplyPayload["company_info"]>(
    key: K,
    value: TemplateApplyPayload["company_info"][K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      company_info: { ...draft.company_info, [key]: value },
    })
  }

  function updateCompanySchedule(schedule: CompanyScheduleStructured) {
    if (!draft) return
    onDraftChange({
      ...draft,
      company_info: { ...draft.company_info, schedule },
    })
  }

  function getSkillConfig(name: string): TemplateSkillConfig | undefined {
    return draft?.skill_configs.find((c) => c.name === name)
  }

  function setSkillConfig(
    name: string,
    patch: Partial<Omit<TemplateSkillConfig, "name">>,
  ) {
    if (!draft) return
    const existing = draft.skill_configs.find((c) => c.name === name)
    const merged: TemplateSkillConfig = {
      name,
      enabled: existing?.enabled ?? false,
      visible: existing?.visible ?? true,
      ...patch,
    }
    const next = existing
      ? draft.skill_configs.map((c) => (c.name === name ? merged : c))
      : [...draft.skill_configs, merged]
    update("skill_configs", next)
  }

  function toggleSkillEnabled(name: string, enabled: boolean) {
    const current = getSkillConfig(name)
    setSkillConfig(name, {
      enabled,
      visible: current?.visible ?? true,
    })
  }

  function toggleSkillVisible(name: string, visible: boolean) {
    setSkillConfig(name, { visible })
  }

  function updateModules<K extends keyof TemplateModules>(
    key: K,
    value: TemplateModules[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      modules: { ...draft.modules, [key]: value },
    })
  }

  function updateBehavior<K extends keyof TemplateBehavior>(
    key: K,
    value: TemplateBehavior[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      behavior: { ...draft.behavior, [key]: value },
    })
  }

  function updateResponseExample<K extends keyof TemplateResponseExamples>(
    key: K,
    value: TemplateResponseExamples[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      response_examples: { ...draft.response_examples, [key]: value },
    })
  }

  function updateKnowledgeBase(patch: Partial<TemplateKnowledgeBase>) {
    if (!draft) return
    onDraftChange({
      ...draft,
      knowledge_base: {
        ...draft.knowledge_base,
        ...patch,
      },
    })
  }

  function updateKnowledgeBaseFAQ(
    index: number,
    key: keyof TemplateKnowledgeBaseFAQ,
    value: string,
  ) {
    if (!draft) return
    updateKnowledgeBase({
      faqs: draft.knowledge_base.faqs.map((faq, faqIndex) =>
        faqIndex === index ? { ...faq, [key]: value } : faq,
      ),
    })
  }

  function addKnowledgeBaseFAQ() {
    if (!draft) return
    updateKnowledgeBase({
      faqs: [...draft.knowledge_base.faqs, { question: "", answer: "" }],
    })
  }

  function removeKnowledgeBaseFAQ(index: number) {
    if (!draft) return
    updateKnowledgeBase({
      faqs: draft.knowledge_base.faqs.filter(
        (_, faqIndex) => faqIndex !== index,
      ),
    })
  }

  function updateStyleGuide<K extends keyof TemplateStyleGuide>(
    key: K,
    value: TemplateStyleGuide[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      style_guide: { ...draft.style_guide, [key]: value },
    })
  }

  function updateFallback<K extends keyof TemplateFallbackPolicy>(
    key: K,
    value: TemplateFallbackPolicy[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      fallback_policy: { ...draft.fallback_policy, [key]: value },
    })
  }

  function updatePriority<K extends keyof TemplatePriorityRules>(
    key: K,
    value: TemplatePriorityRules[K],
  ) {
    if (!draft) return
    onDraftChange({
      ...draft,
      priority_rules: { ...draft.priority_rules, [key]: value },
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 shadow-2xl data-[side=right]:!w-full data-[side=right]:sm:!w-[720px] data-[side=right]:sm:!max-w-[720px]"
      >
        <SheetHeader className="bg-muted/10 border-b px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 ring-primary/20 text-primary flex size-10 items-center justify-center rounded-xl ring-1">
              {template ? (
                <TemplateIcon name={template.icon} className="size-5" />
              ) : (
                <IconSparkles className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-left">
              <SheetTitle className="truncate text-xl font-bold tracking-tight">
                {template?.name ?? t("pages.agent.templates.drawer_title")}
              </SheetTitle>
              <SheetDescription className="line-clamp-2">
                {template?.short_description ??
                  t("pages.agent.templates.drawer_description")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-x-hidden overflow-y-scroll px-6 py-6">
          {draft && template ? (
            <div className="space-y-8">
              <ConfigSection
                title={t("pages.agent.templates.sections.identity")}
                description={t(
                  "pages.agent.templates.sections.identity_description",
                )}
              >
                <Field
                  label={t("pages.agent.templates.fields.name")}
                  htmlFor="tpl-name"
                >
                  <Input
                    id="tpl-name"
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fields.short_description",
                    "Resumo do template",
                  )}
                  htmlFor="tpl-short-description"
                  description={t(
                    "pages.agent.templates.fields.short_description_hint",
                    "Texto que aparece no card da biblioteca de templates.",
                  )}
                >
                  <Textarea
                    id="tpl-short-description"
                    value={draft.short_description}
                    onChange={(e) =>
                      update("short_description", e.target.value)
                    }
                    rows={2}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.fields.presentation")}
                  htmlFor="tpl-presentation"
                  description={t(
                    "pages.agent.templates.fields.presentation_hint",
                  )}
                >
                  <Textarea
                    id="tpl-presentation"
                    value={draft.presentation}
                    onChange={(e) => update("presentation", e.target.value)}
                    rows={3}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("pages.agent.templates.fields.tone")}>
                    <Select
                      value={draft.tone}
                      onValueChange={(value) =>
                        update("tone", value as TemplateTone)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">
                          {t("pages.agent.templates.tones.formal")}
                        </SelectItem>
                        <SelectItem value="friendly">
                          {t("pages.agent.templates.tones.friendly")}
                        </SelectItem>
                        <SelectItem value="neutral">
                          {t("pages.agent.templates.tones.neutral")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t("pages.agent.templates.fields.language")}>
                    <Select
                      value={draft.language}
                      onValueChange={(value) =>
                        update("language", value as TemplateLanguage)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-br">Português (BR)</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="zh">中文</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field
                  label={t("pages.agent.templates.fields.model", "Modelo")}
                  description={t(
                    "pages.agent.templates.fields.model_hint",
                    "Opcional. Se preenchido, grava o modelo recomendado no frontmatter do AGENT.md.",
                  )}
                >
                  <Input
                    value={draft.model ?? ""}
                    onChange={(e) =>
                      update("model", e.target.value.trim() || undefined)
                    }
                    placeholder="gpt-4o-mini"
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.modules.title")}
                description={t("pages.agent.templates.modules.description")}
              >
                <ModuleToggle
                  icon={<IconCalendarStats className="size-4" />}
                  label={t("pages.agent.templates.modules.professionals_label")}
                  hint={t("pages.agent.templates.modules.professionals_hint")}
                  checked={draft.modules.professionals_enabled}
                  onCheckedChange={(checked) =>
                    updateModules("professionals_enabled", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconPackage className="size-4" />}
                  label={t("pages.agent.templates.modules.products_label")}
                  hint={t("pages.agent.templates.modules.products_hint")}
                  checked={draft.modules.products_enabled}
                  onCheckedChange={(checked) =>
                    updateModules("products_enabled", checked)
                  }
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.behavior.activation.title")}
                description={t(
                  "pages.agent.templates.behavior.activation.description",
                )}
                icon={<IconPower className="size-4" />}
                accent={draft.behavior.master_enabled ? undefined : "warning"}
              >
                <ModuleToggle
                  icon={<IconPower className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.activation.master_enabled",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.activation.master_hint",
                  )}
                  checked={draft.behavior.master_enabled}
                  onCheckedChange={(checked) =>
                    updateBehavior("master_enabled", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconCalendarStats className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.activation.business_hours_only",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.activation.business_hours_only_hint",
                  )}
                  checked={draft.behavior.business_hours_only}
                  onCheckedChange={(checked) =>
                    updateBehavior("business_hours_only", checked)
                  }
                />
                {draft.behavior.business_hours_only ? (
                  <Field
                    label={t(
                      "pages.agent.templates.behavior.activation.out_of_hours_reply",
                    )}
                  >
                    <Textarea
                      value={draft.behavior.out_of_hours_reply}
                      onChange={(e) =>
                        updateBehavior("out_of_hours_reply", e.target.value)
                      }
                      rows={2}
                      placeholder={t(
                        "pages.agent.templates.behavior.activation.out_of_hours_reply_placeholder",
                      )}
                    />
                  </Field>
                ) : null}
                <ModuleToggle
                  icon={<IconSend className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.activation.respond_in_dm",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.activation.respond_in_dm_hint",
                  )}
                  checked={draft.behavior.respond_in_dm}
                  onCheckedChange={(checked) =>
                    updateBehavior("respond_in_dm", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconSend className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.activation.respond_in_groups",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.activation.respond_in_groups_hint",
                  )}
                  checked={draft.behavior.respond_in_groups}
                  onCheckedChange={(checked) =>
                    updateBehavior("respond_in_groups", checked)
                  }
                />
                {draft.behavior.respond_in_groups ? (
                  <ModuleToggle
                    icon={<IconBolt className="size-4" />}
                    label={t(
                      "pages.agent.templates.behavior.activation.group_mention_only",
                    )}
                    hint={t(
                      "pages.agent.templates.behavior.activation.group_mention_only_hint",
                    )}
                    checked={draft.behavior.group_mention_only}
                    onCheckedChange={(checked) =>
                      updateBehavior("group_mention_only", checked)
                    }
                  />
                ) : null}
                <Field
                  label={t(
                    "pages.agent.templates.behavior.activation.keyword_trigger",
                  )}
                  description={t(
                    "pages.agent.templates.behavior.activation.keyword_trigger_hint",
                  )}
                >
                  <Input
                    value={draft.behavior.keyword_trigger}
                    onChange={(e) =>
                      updateBehavior("keyword_trigger", e.target.value)
                    }
                    placeholder={t(
                      "pages.agent.templates.behavior.activation.keyword_trigger_placeholder",
                    )}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.behavior.outbound.title")}
                description={t(
                  "pages.agent.templates.behavior.outbound.description",
                )}
                icon={<IconSend className="size-4" />}
                accent={
                  draft.behavior.outbound_only_mode ? "warning" : undefined
                }
              >
                <ModuleToggle
                  icon={<IconSend className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.outbound.outbound_only_mode",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.outbound.outbound_only_mode_hint",
                  )}
                  checked={draft.behavior.outbound_only_mode}
                  onCheckedChange={(checked) =>
                    updateBehavior("outbound_only_mode", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconShieldLock className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.outbound.ignore_other_bots",
                  )}
                  hint=""
                  checked={draft.behavior.ignore_other_bots}
                  onCheckedChange={(checked) =>
                    updateBehavior("ignore_other_bots", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconShieldLock className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.outbound.ignore_forwarded",
                  )}
                  hint=""
                  checked={draft.behavior.ignore_forwarded_messages}
                  onCheckedChange={(checked) =>
                    updateBehavior("ignore_forwarded_messages", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconShieldLock className="size-4" />}
                  label={t(
                    "pages.agent.templates.behavior.outbound.ignore_self",
                  )}
                  hint={t(
                    "pages.agent.templates.behavior.outbound.ignore_self_hint",
                  )}
                  checked={draft.behavior.ignore_self_messages}
                  onCheckedChange={(checked) =>
                    updateBehavior("ignore_self_messages", checked)
                  }
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.behavior.media.title")}
                description={t(
                  "pages.agent.templates.behavior.media.description",
                )}
                icon={<IconPhoto className="size-4" />}
              >
                <ModuleToggle
                  icon={<IconPhoto className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.images")}
                  hint=""
                  checked={draft.behavior.process_images}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_images", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconPackage className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.documents")}
                  hint=""
                  checked={draft.behavior.process_documents}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_documents", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconBolt className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.audio")}
                  hint=""
                  checked={draft.behavior.process_audio}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_audio", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconPhoto className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.video")}
                  hint=""
                  checked={draft.behavior.process_video}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_video", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconSparkles className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.stickers")}
                  hint=""
                  checked={draft.behavior.process_stickers}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_stickers", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconSparkles className="size-4" />}
                  label={t("pages.agent.templates.behavior.media.location")}
                  hint=""
                  checked={draft.behavior.process_location}
                  onCheckedChange={(checked) =>
                    updateBehavior("process_location", checked)
                  }
                />
                <Field
                  label={t("pages.agent.templates.behavior.media.max_size_mb")}
                  description={t(
                    "pages.agent.templates.behavior.media.max_size_mb_hint",
                  )}
                >
                  <Input
                    type="number"
                    min={0}
                    value={draft.behavior.max_media_size_mb}
                    onChange={(e) =>
                      updateBehavior(
                        "max_media_size_mb",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.behavior.scope.title")}
                description={t(
                  "pages.agent.templates.behavior.scope.description",
                )}
                icon={<IconShieldLock className="size-4" />}
                accent="info"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t(
                      "pages.agent.templates.behavior.scope.session_timeout",
                    )}
                    description={t(
                      "pages.agent.templates.behavior.scope.session_timeout_hint",
                    )}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={draft.behavior.session_timeout_minutes}
                      onChange={(e) =>
                        updateBehavior(
                          "session_timeout_minutes",
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={t(
                      "pages.agent.templates.behavior.scope.max_msgs_session",
                    )}
                    description={t(
                      "pages.agent.templates.behavior.scope.max_msgs_session_hint",
                    )}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={draft.behavior.max_messages_per_session}
                      onChange={(e) =>
                        updateBehavior(
                          "max_messages_per_session",
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={t(
                      "pages.agent.templates.behavior.scope.rate_per_min",
                    )}
                    description={t(
                      "pages.agent.templates.behavior.scope.rate_per_min_hint",
                    )}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={draft.behavior.max_messages_per_minute_per_user}
                      onChange={(e) =>
                        updateBehavior(
                          "max_messages_per_minute_per_user",
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={t(
                      "pages.agent.templates.behavior.scope.cooldown_seconds",
                    )}
                    description={t(
                      "pages.agent.templates.behavior.scope.cooldown_seconds_hint",
                    )}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={draft.behavior.response_cooldown_seconds}
                      onChange={(e) =>
                        updateBehavior(
                          "response_cooldown_seconds",
                          Math.max(0, Number(e.target.value) || 0),
                        )
                      }
                    />
                  </Field>
                </div>
                <ModuleToggle
                  icon={<IconShieldLock className="size-4" />}
                  label={t("pages.agent.templates.behavior.scope.mask_pii")}
                  hint={t("pages.agent.templates.behavior.scope.mask_pii_hint")}
                  checked={draft.behavior.mask_pii_in_replies}
                  onCheckedChange={(checked) =>
                    updateBehavior("mask_pii_in_replies", checked)
                  }
                />
                <ModuleToggle
                  icon={<IconPhoto className="size-4" />}
                  label={t("pages.agent.templates.behavior.scope.store_media")}
                  hint=""
                  checked={draft.behavior.store_received_media}
                  onCheckedChange={(checked) =>
                    updateBehavior("store_received_media", checked)
                  }
                />
                <Field
                  label={t(
                    "pages.agent.templates.behavior.scope.handoff_keywords",
                  )}
                  description={t(
                    "pages.agent.templates.behavior.scope.handoff_keywords_hint",
                  )}
                >
                  <EditableList
                    items={draft.behavior.handoff_keywords}
                    onChange={(items) =>
                      updateBehavior("handoff_keywords", items)
                    }
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.company")}
                description={t(
                  "pages.agent.templates.sections.company_description",
                )}
              >
                <Field label={t("pages.agent.templates.fields.company_name")}>
                  <Input
                    value={draft.company_info.name}
                    onChange={(e) => updateCompany("name", e.target.value)}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.fields.company_contact")}
                >
                  <Input
                    value={draft.company_info.contact}
                    onChange={(e) => updateCompany("contact", e.target.value)}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.fields.company_schedule")}
                  description={t(
                    "pages.agent.templates.fields.company_schedule_hint",
                  )}
                >
                  <ScheduleEditor
                    schedule={draft.company_info.schedule}
                    onChange={updateCompanySchedule}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.fields.company_general_info")}
                  description={t(
                    "pages.agent.templates.fields.company_general_info_hint",
                  )}
                >
                  <Textarea
                    value={draft.company_info.general_info}
                    onChange={(e) =>
                      updateCompany("general_info", e.target.value)
                    }
                    rows={4}
                    placeholder={t(
                      "pages.agent.templates.fields.company_general_info_placeholder",
                    )}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.knowledge_base",
                  "Base de conhecimento",
                )}
                description={t(
                  "pages.agent.templates.sections.knowledge_base_description",
                  "Contexto oficial e perguntas frequentes que o agente deve usar como fonte de verdade.",
                )}
                accent="info"
                icon={<IconBook2 className="size-4" />}
              >
                <Field
                  label={t(
                    "pages.agent.templates.knowledge_base.overview",
                    "Contexto oficial",
                  )}
                  description={t(
                    "pages.agent.templates.knowledge_base.overview_hint",
                    "Políticas, observações, regras comerciais e informações importantes que não cabem nos campos estruturados.",
                  )}
                >
                  <Textarea
                    value={draft.knowledge_base.overview}
                    onChange={(event) =>
                      updateKnowledgeBase({ overview: event.target.value })
                    }
                    rows={5}
                    placeholder={t(
                      "pages.agent.templates.knowledge_base.overview_placeholder",
                      "Ex.: Entregas na região central são combinadas com o setor comercial. Produtos sob consulta não devem ter preço estimado.",
                    )}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.knowledge_base.faqs",
                    "Perguntas frequentes",
                  )}
                  description={t(
                    "pages.agent.templates.knowledge_base.faqs_hint",
                    "Adicione perguntas e respostas oficiais para dúvidas recorrentes.",
                  )}
                >
                  <div className="space-y-3">
                    {draft.knowledge_base.faqs.map((faq, index) => (
                      <div
                        key={index}
                        className="border-border/50 bg-muted/10 space-y-3 rounded-lg border p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground text-xs font-medium">
                            {t(
                              "pages.agent.templates.knowledge_base.faq_item",
                              {
                                defaultValue: "FAQ {{number}}",
                                number: index + 1,
                              },
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeKnowledgeBaseFAQ(index)}
                            title={t(
                              "pages.agent.templates.knowledge_base.remove_faq",
                              "Remover FAQ",
                            )}
                          >
                            <IconX className="size-4" />
                          </Button>
                        </div>
                        <Input
                          value={faq.question}
                          onChange={(event) =>
                            updateKnowledgeBaseFAQ(
                              index,
                              "question",
                              event.target.value,
                            )
                          }
                          placeholder={t(
                            "pages.agent.templates.knowledge_base.question_placeholder",
                            "Pergunta",
                          )}
                        />
                        <Textarea
                          value={faq.answer}
                          onChange={(event) =>
                            updateKnowledgeBaseFAQ(
                              index,
                              "answer",
                              event.target.value,
                            )
                          }
                          rows={3}
                          placeholder={t(
                            "pages.agent.templates.knowledge_base.answer_placeholder",
                            "Resposta oficial",
                          )}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addKnowledgeBaseFAQ}
                    >
                      <IconPlus className="size-3.5" />
                      {t(
                        "pages.agent.templates.knowledge_base.add_faq",
                        "Adicionar FAQ",
                      )}
                    </Button>
                  </div>
                </Field>
              </ConfigSection>

              {draft.modules.professionals_enabled ? (
                <ConfigSection
                  title={t("pages.agent.templates.professionals.title")}
                  description={t(
                    "pages.agent.templates.professionals.description",
                  )}
                  icon={<IconCalendarStats className="size-4" />}
                >
                  <ProfessionalsEditor
                    professionals={draft.professionals}
                    onChange={(items) => update("professionals", items)}
                  />
                </ConfigSection>
              ) : null}

              {draft.modules.products_enabled ? (
                <ConfigSection
                  title={t("pages.agent.templates.products.title")}
                  description={t("pages.agent.templates.products.description")}
                  icon={<IconPackage className="size-4" />}
                >
                  <ProductsEditor
                    products={draft.products}
                    onChange={(items) => update("products", items)}
                  />
                </ConfigSection>
              ) : null}

              <ConfigSection
                title={t("pages.agent.templates.sections.personality")}
                description={t(
                  "pages.agent.templates.sections.personality_description",
                )}
              >
                <EditableList
                  items={draft.personality}
                  onChange={(items) => update("personality", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.values", "Valores")}
                description={t(
                  "pages.agent.templates.sections.values_description",
                  "Princípios que orientam a identidade do agente e são gravados em SOUL.md.",
                )}
              >
                <EditableList
                  items={draft.values}
                  onChange={(items) => update("values", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.functions")}
                description={t(
                  "pages.agent.templates.sections.functions_description",
                )}
              >
                <EditableList
                  items={draft.functions}
                  onChange={(items) => update("functions", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.prohibitions")}
                description={t(
                  "pages.agent.templates.sections.prohibitions_description",
                )}
                accent="warning"
              >
                <EditableList
                  items={draft.prohibitions}
                  onChange={(items) => update("prohibitions", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.protections")}
                description={t(
                  "pages.agent.templates.sections.protections_description",
                )}
                accent="info"
                icon={<IconShieldLock className="size-4" />}
              >
                <EditableList
                  items={draft.protections}
                  onChange={(items) => update("protections", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.conversation_flow",
                  "Fluxo de conversa",
                )}
                description={t(
                  "pages.agent.templates.sections.conversation_flow_description",
                  "Passos que o agente deve seguir durante o atendimento.",
                )}
              >
                <EditableList
                  items={draft.conversation_flow}
                  onChange={(items) => update("conversation_flow", items)}
                />
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.response_examples",
                  "Exemplos de resposta",
                )}
                description={t(
                  "pages.agent.templates.sections.response_examples_description",
                  "Frases base para saudação, esclarecimento, encaminhamento e encerramento.",
                )}
              >
                {(
                  [
                    ["greeting", "Saudação"],
                    ["clarification", "Esclarecimento"],
                    ["unknown_answer", "Quando não souber"],
                    ["routing", "Encaminhamento"],
                    ["closing", "Encerramento"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={draft.response_examples[key]}
                      onChange={(event) =>
                        updateResponseExample(key, event.target.value)
                      }
                      rows={2}
                    />
                  </Field>
                ))}
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.style_guide",
                  "Guia de estilo",
                )}
                description={t(
                  "pages.agent.templates.sections.style_guide_description",
                  "Regras editoriais do que o agente deve e não deve fazer.",
                )}
              >
                <Field
                  label={t(
                    "pages.agent.templates.style.emoji_policy",
                    "Uso de emojis",
                  )}
                  description={t(
                    "pages.agent.templates.style.emoji_policy_hint",
                    "Escolha se o agente pode usar emoji de forma rara ou se deve evitar totalmente.",
                  )}
                >
                  <Select
                    value={draft.style_guide.emoji_policy ?? "minimal"}
                    onValueChange={(value) =>
                      updateStyleGuide("emoji_policy", value as EmojiPolicy)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">
                        {t(
                          "pages.agent.templates.style.emoji_minimal",
                          "Poucos emojis quando fizer sentido",
                        )}
                      </SelectItem>
                      <SelectItem value="none">
                        {t(
                          "pages.agent.templates.style.emoji_none",
                          "Não usar nenhum emoji",
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("pages.agent.templates.style.do", "Faça")}>
                  <EditableList
                    items={draft.style_guide.do}
                    onChange={(items) => updateStyleGuide("do", items)}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.style.dont", "Não faça")}
                >
                  <EditableList
                    items={draft.style_guide.dont}
                    onChange={(items) => updateStyleGuide("dont", items)}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.fallback",
                  "Fallback e escalação",
                )}
                description={t(
                  "pages.agent.templates.sections.fallback_description",
                  "Como agir quando faltar informação, confiança ou autorização.",
                )}
                accent="warning"
              >
                <Field
                  label={t(
                    "pages.agent.templates.fallback.max_clarifying_questions",
                    "Máx. perguntas de esclarecimento",
                  )}
                >
                  <Input
                    type="number"
                    min={0}
                    value={draft.fallback_policy.max_clarifying_questions}
                    onChange={(event) =>
                      updateFallback(
                        "max_clarifying_questions",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fallback.when_unsure",
                    "Quando estiver inseguro",
                  )}
                >
                  <Textarea
                    value={draft.fallback_policy.when_unsure}
                    onChange={(event) =>
                      updateFallback("when_unsure", event.target.value)
                    }
                    rows={2}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fallback.when_to_route",
                    "Quando encaminhar",
                  )}
                >
                  <EditableList
                    items={draft.fallback_policy.when_to_route}
                    onChange={(items) => updateFallback("when_to_route", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fallback.route_message",
                    "Mensagem de encaminhamento",
                  )}
                >
                  <Textarea
                    value={draft.fallback_policy.route_message}
                    onChange={(event) =>
                      updateFallback("route_message", event.target.value)
                    }
                    rows={2}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.priority_rules",
                  "Regras de prioridade",
                )}
                description={t(
                  "pages.agent.templates.sections.priority_rules_description",
                  "Critérios que classificam uma conversa como alta, média ou baixa prioridade.",
                )}
              >
                <Field label={t("pages.agent.templates.priority.high", "Alta")}>
                  <EditableList
                    items={draft.priority_rules.high}
                    onChange={(items) => updatePriority("high", items)}
                  />
                </Field>
                <Field
                  label={t("pages.agent.templates.priority.medium", "Média")}
                >
                  <EditableList
                    items={draft.priority_rules.medium}
                    onChange={(items) => updatePriority("medium", items)}
                  />
                </Field>
                <Field label={t("pages.agent.templates.priority.low", "Baixa")}>
                  <EditableList
                    items={draft.priority_rules.low}
                    onChange={(items) => updatePriority("low", items)}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.knowledge_security",
                  "Conhecimento, segurança e qualidade",
                )}
                description={t(
                  "pages.agent.templates.sections.knowledge_security_description",
                  "Políticas de fonte, proteção contra abuso e métricas esperadas.",
                )}
                accent="info"
                icon={<IconShieldLock className="size-4" />}
              >
                <Field
                  label={t(
                    "pages.agent.templates.knowledge_policy",
                    "Política de conhecimento",
                  )}
                >
                  <EditableList
                    items={draft.knowledge_policy}
                    onChange={(items) => update("knowledge_policy", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.security_rules",
                    "Regras de segurança",
                  )}
                >
                  <EditableList
                    items={draft.security_rules}
                    onChange={(items) => update("security_rules", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.quality_metrics",
                    "Métricas de qualidade",
                  )}
                >
                  <EditableList
                    items={draft.quality_metrics}
                    onChange={(items) => update("quality_metrics", items)}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.data_contracts",
                  "Campos, handoff e saída estruturada",
                )}
                description={t(
                  "pages.agent.templates.sections.data_contracts_description",
                  "Contratos JSON usados pelo agente para coleta de campos, resumo para humano e saída estruturada.",
                )}
              >
                <Field
                  label={t(
                    "pages.agent.templates.data.required_fields",
                    "Campos obrigatórios por intenção",
                  )}
                >
                  <JsonObjectEditor
                    editorKey={`${draft.template_id}:required-fields`}
                    value={draft.required_fields_by_intent}
                    onChange={(value) =>
                      update(
                        "required_fields_by_intent",
                        value as Record<string, string[]>,
                      )
                    }
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.data.handoff_summary",
                    "Resumo para humano",
                  )}
                >
                  <JsonObjectEditor
                    editorKey={`${draft.template_id}:handoff`}
                    value={draft.handoff_summary_template}
                    onChange={(value) =>
                      update(
                        "handoff_summary_template",
                        value as unknown as TemplateApplyPayload["handoff_summary_template"],
                      )
                    }
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.data.structured_output",
                    "Saída estruturada",
                  )}
                >
                  <JsonObjectEditor
                    editorKey={`${draft.template_id}:structured-output`}
                    value={draft.structured_output_template}
                    onChange={(value) =>
                      update(
                        "structured_output_template",
                        value as unknown as TemplateApplyPayload["structured_output_template"],
                      )
                    }
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t(
                  "pages.agent.templates.sections.tools_permissions",
                  "Ferramentas e permissões",
                )}
                description={t(
                  "pages.agent.templates.sections.tools_permissions_description",
                  "Ferramentas recomendadas, integrações necessárias e ações que exigem aprovação.",
                )}
              >
                <Field
                  label={t(
                    "pages.agent.templates.fields.permission_level",
                    "Nível de permissão",
                  )}
                >
                  <Select
                    value={draft.permission_level}
                    onValueChange={(value) =>
                      update("permission_level", value as PermissionLevel)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read_only">Somente leitura</SelectItem>
                      <SelectItem value="write_with_confirmation">
                        Escrita com confirmação
                      </SelectItem>
                      <SelectItem value="write_allowed">
                        Escrita permitida
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fields.recommended_tools",
                    "Ferramentas recomendadas",
                  )}
                >
                  <EditableList
                    items={draft.recommended_tools}
                    onChange={(items) => update("recommended_tools", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fields.tool_namespaces",
                    "Namespaces de ferramentas",
                  )}
                >
                  <EditableList
                    items={draft.tool_namespaces}
                    onChange={(items) => update("tool_namespaces", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fields.required_integrations",
                    "Integrações necessárias",
                  )}
                >
                  <EditableList
                    items={draft.required_integrations}
                    onChange={(items) => update("required_integrations", items)}
                  />
                </Field>
                <Field
                  label={t(
                    "pages.agent.templates.fields.approval_required_for",
                    "Ações que exigem aprovação",
                  )}
                >
                  <EditableList
                    items={draft.approval_required_for}
                    onChange={(items) => update("approval_required_for", items)}
                  />
                </Field>
              </ConfigSection>

              <ConfigSection
                title={t("pages.agent.templates.sections.skills")}
                description={t(
                  "pages.agent.templates.sections.skills_description",
                )}
              >
                {installedSkills.length === 0 ? (
                  <div className="border-border/40 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                    {t("pages.agent.templates.skills_empty")}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {installedSkills.map((skill) => {
                      const cfg = getSkillConfig(skill.name)
                      const enabled = cfg?.enabled ?? false
                      const visible = cfg?.visible ?? true
                      return (
                        <li
                          key={skill.name}
                          className="border-border/50 bg-muted/10 space-y-2 rounded-lg border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <Label
                                htmlFor={`skill-enabled-${skill.name}`}
                                className="cursor-pointer text-sm font-medium"
                              >
                                {skill.name}
                              </Label>
                              {skill.description ? (
                                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                                  {skill.description}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                {t(
                                  "pages.agent.templates.skills_toggles.enabled",
                                )}
                              </span>
                              <Switch
                                id={`skill-enabled-${skill.name}`}
                                checked={enabled}
                                onCheckedChange={(checked) =>
                                  toggleSkillEnabled(skill.name, checked)
                                }
                              />
                            </div>
                          </div>
                          {enabled ? (
                            <div className="border-border/40 flex items-center justify-between gap-3 border-t pt-2">
                              <Label
                                htmlFor={`skill-visible-${skill.name}`}
                                className="text-muted-foreground cursor-pointer text-xs"
                              >
                                {t(
                                  "pages.agent.templates.skills_toggles.visible_label",
                                )}
                                <span className="text-muted-foreground/70 ml-1 text-[11px]">
                                  {t(
                                    "pages.agent.templates.skills_toggles.visible_hint",
                                  )}
                                </span>
                              </Label>
                              <Switch
                                id={`skill-visible-${skill.name}`}
                                checked={visible}
                                onCheckedChange={(checked) =>
                                  toggleSkillVisible(skill.name, checked)
                                }
                              />
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </ConfigSection>
            </div>
          ) : null}
        </div>

        <div className="bg-background/80 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {hasSavedOverride ? (
              <Button
                variant="outline"
                onClick={onResetTemplate}
                disabled={isApplying || isSavingTemplate || isResettingTemplate}
              >
                {isResettingTemplate ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : null}
                {isResettingTemplate
                  ? t(
                      "pages.agent.templates.resetting_template",
                      "Restaurando...",
                    )
                  : t(
                      "pages.agent.templates.reset_template",
                      "Restaurar padrão",
                    )}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={onSaveTemplate}
              disabled={
                isApplying ||
                isSavingTemplate ||
                isResettingTemplate ||
                !draft ||
                draft.name.trim() === ""
              }
            >
              {isSavingTemplate ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconCheck className="size-4" />
              )}
              {isSavingTemplate
                ? t("pages.agent.templates.saving_template", "Salvando...")
                : t("pages.agent.templates.save_template", "Salvar template")}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isApplying || isSavingTemplate || isResettingTemplate}
            >
              {t("pages.agent.templates.cancel")}
            </Button>
            <Button
              onClick={onApply}
              disabled={
                isApplying ||
                isSavingTemplate ||
                isResettingTemplate ||
                !draft ||
                draft.name.trim() === ""
              }
            >
              {isApplying ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconCheck className="size-4" />
              )}
              {isApplying
                ? t("pages.agent.templates.applying")
                : t("pages.agent.templates.apply")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ConfigSection({
  title,
  description,
  children,
  accent,
  icon,
}: {
  title: string
  description?: string
  children: React.ReactNode
  accent?: "warning" | "info"
  icon?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "border-border/40 bg-card/40 space-y-4 rounded-xl border p-5 shadow-sm",
        accent === "warning" && "border-amber-500/30 bg-amber-500/5",
        accent === "info" && "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {icon}
          {title}
        </h3>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string
  description?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium tracking-wide">
        {label}
      </Label>
      {children}
      {description ? (
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
  )
}

function JsonObjectEditor({
  editorKey,
  value,
  onChange,
}: {
  editorKey: string
  value: unknown
  onChange: (value: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(value, null, 2))
    setError(null)
  }, [editorKey, value])

  function commit(next: string) {
    try {
      const parsed = JSON.parse(next) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError(
          t(
            "pages.agent.templates.json_object_error",
            "Use um objeto JSON válido.",
          ),
        )
        return
      }
      setError(null)
      onChange(parsed as Record<string, unknown>)
    } catch {
      setError(
        t(
          "pages.agent.templates.json_syntax_error",
          "JSON inválido. Corrija a sintaxe antes de salvar ou aplicar.",
        ),
      )
    }
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          if (error) setError(null)
        }}
        onBlur={() => {
          commit(text)
          try {
            setText(JSON.stringify(JSON.parse(text), null, 2))
          } catch {
            // commit already shows the syntax error.
          }
        }}
        rows={8}
        spellCheck={false}
        className={cn(
          "font-mono text-xs",
          error && "border-destructive focus-visible:ring-destructive/40",
        )}
      />
      {error ? (
        <p className="text-destructive text-[11px] leading-relaxed">{error}</p>
      ) : null}
    </div>
  )
}

function ModuleToggle({
  icon,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="border-border/50 bg-muted/10 hover:bg-muted/20 flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-3 transition-colors">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="bg-primary/10 ring-primary/20 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg ring-1">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {hint}
          </div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
