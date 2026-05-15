import {
  IconBolt,
  IconCalendarStats,
  IconCheck,
  IconLoader2,
  IconPackage,
  IconPhoto,
  IconPower,
  IconSend,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react"
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
  TemplateApplyPayload,
  TemplateBehavior,
  TemplateLanguage,
  TemplateModules,
  TemplateTone,
} from "./types"

interface TemplateConfigSheetProps {
  open: boolean
  template: AgentTemplate | null
  draft: TemplateApplyPayload | null
  isApplying: boolean
  installedSkills: SkillSupportItem[]
  onDraftChange: (draft: TemplateApplyPayload) => void
  onApply: () => void
  onOpenChange: (open: boolean) => void
}

export function TemplateConfigSheet({
  open,
  template,
  draft,
  isApplying,
  installedSkills,
  onDraftChange,
  onApply,
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

  function toggleSkill(name: string) {
    if (!draft) return
    const has = draft.skills.includes(name)
    const next = has
      ? draft.skills.filter((s) => s !== name)
      : [...draft.skills, name]
    update("skills", next)
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
                accent={draft.behavior.outbound_only_mode ? "warning" : undefined}
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
                  hint={t(
                    "pages.agent.templates.behavior.scope.mask_pii_hint",
                  )}
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
                      const checked = draft.skills.includes(skill.name)
                      return (
                        <li
                          key={skill.name}
                          className="border-border/50 bg-muted/10 flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <Label
                              htmlFor={`skill-${skill.name}`}
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
                          <Switch
                            id={`skill-${skill.name}`}
                            checked={checked}
                            onCheckedChange={() => toggleSkill(skill.name)}
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </ConfigSection>
            </div>
          ) : null}
        </div>

        <div className="bg-background/80 flex items-center justify-end gap-3 border-t px-6 py-4 backdrop-blur-sm">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            {t("pages.agent.templates.cancel")}
          </Button>
          <Button
            onClick={onApply}
            disabled={isApplying || !draft || draft.name.trim() === ""}
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
