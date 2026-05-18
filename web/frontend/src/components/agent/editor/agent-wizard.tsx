import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"

import { AGENT_TEMPLATES } from "@/components/agent/templates/catalog"
import type {
  AgentTemplate,
  TemplateApplyPayload,
} from "@/components/agent/templates/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { AgentTemplateGallery } from "./agent-template-gallery"
import {
  ColorPicker,
  DEFAULT_BG_PRESETS,
  DEFAULT_FG_PRESETS,
} from "./color-picker"
import { IconPicker } from "./icon-picker"
import { TagInput } from "./tag-input"

export type WizardStepID =
  | "template"
  | "identity"
  | "role"
  | "prompt"
  | "review"

const STEPS: { id: WizardStepID; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "identity", label: "Identidade" },
  { id: "role", label: "Papel" },
  { id: "prompt", label: "Prompt" },
  { id: "review", label: "Revisar" },
]

function normalizeID(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .slice(0, 64) || "agent"
  )
}

export interface WizardDraft {
  templateID: string
  name: string
  agentID: string
  iconID: string
  background: string
  foreground: string
  departments: string[]
  triageFields: string[]
  presentation: string
  shortDescription: string
}

export interface AgentWizardProps {
  open: boolean
  existingIDs: string[]
  templates?: readonly AgentTemplate[]
  isSubmitting?: boolean
  onSubmit: (draft: WizardDraft, payload: TemplateApplyPayload) => void
  onTest?: (draft: WizardDraft, payload: TemplateApplyPayload) => void
  onCancel: () => void
}

const INITIAL_DRAFT: WizardDraft = {
  templateID: "",
  name: "",
  agentID: "",
  iconID: "robot",
  background: DEFAULT_BG_PRESETS[0]!,
  foreground: DEFAULT_FG_PRESETS[0]!,
  departments: [],
  triageFields: [],
  presentation: "",
  shortDescription: "",
}

export function AgentWizard({
  open,
  existingIDs,
  templates = AGENT_TEMPLATES,
  isSubmitting,
  onSubmit,
  onTest,
  onCancel,
}: AgentWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<WizardDraft>(INITIAL_DRAFT)

  useEffect(() => {
    if (!open) {
      setStepIndex(0)
      setDraft(INITIAL_DRAFT)
    }
  }, [open])

  const step = STEPS[stepIndex]!.id
  const tmpl = useMemo(
    () => templates.find((t) => t.id === draft.templateID) ?? null,
    [templates, draft.templateID],
  )

  useEffect(() => {
    if (!tmpl) return
    setDraft((d) => ({
      ...d,
      iconID: d.iconID || tmpl.icon,
      shortDescription: d.shortDescription || tmpl.short_description,
      presentation: d.presentation || tmpl.presentation,
    }))
  }, [tmpl])

  const idPreview = normalizeID(draft.agentID || draft.name || "agent")
  const idConflict = existingIDs.includes(idPreview)

  const canAdvance = useMemo(() => {
    if (step === "template") return Boolean(draft.templateID)
    if (step === "identity")
      return draft.name.trim().length > 0 && !idConflict
    if (step === "role") return true
    if (step === "prompt")
      return (
        draft.presentation.trim().length > 0 ||
        draft.shortDescription.trim().length > 0
      )
    return true
  }, [step, draft, idConflict])

  function next() {
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))
  }
  function prev() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  function buildPayload(): TemplateApplyPayload | null {
    if (!tmpl) return null
    return {
      ...JSON.parse(JSON.stringify(tmpl)) as TemplateApplyPayload,
      agent_id: idPreview,
      template_id: tmpl.id,
      name: draft.name.trim() || tmpl.name,
      short_description: draft.shortDescription || tmpl.short_description,
      presentation: draft.presentation || tmpl.presentation,
      skill_configs: tmpl.recommended_skills.map((name) => ({
        name,
        enabled: true,
        visible: true,
      })),
    }
  }

  function handleFinish() {
    const payload = buildPayload()
    if (!payload) return
    onSubmit(draft, payload)
  }

  function handleTest() {
    const payload = buildPayload()
    if (!payload || !onTest) return
    onTest(draft, payload)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-border/40 border-b px-6 py-4">
          <SheetTitle>Novo agente</SheetTitle>
          <SheetDescription>
            5 passos rápidos. Pode testar antes de ativar.
          </SheetDescription>
        </SheetHeader>

        <nav
          aria-label="Passos do wizard"
          className="border-border/40 flex items-center gap-2 border-b px-6 py-3"
        >
          {STEPS.map((s, i) => {
            const active = i === stepIndex
            const done = i < stepIndex
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (i <= stepIndex) setStepIndex(i)
                }}
                aria-current={active ? "step" : undefined}
                disabled={i > stepIndex}
                className={cn(
                  "focus-visible:ring-ring focus-visible:ring-offset-background flex flex-1 items-center gap-1 rounded-md py-1 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "text-foreground"
                    : done
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-[10px]",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <IconCheck className="size-3" /> : i + 1}
                </span>
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {step === "template" && (
            <AgentTemplateGallery
              templates={templates}
              selectedID={draft.templateID}
              onSelect={(id) => setDraft((d) => ({ ...d, templateID: id }))}
              compact
            />
          )}

          {step === "identity" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-name">Nome exibido</Label>
                <Input
                  id="wizard-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Ex.: Ana — Atendimento"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-id">ID técnico</Label>
                <Input
                  id="wizard-id"
                  value={draft.agentID}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, agentID: e.target.value }))
                  }
                  placeholder={idPreview}
                />
                <p
                  className={cn(
                    "text-xs",
                    idConflict
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                  role={idConflict ? "alert" : undefined}
                >
                  {idConflict
                    ? `O ID "${idPreview}" já existe — escolha outro.`
                    : `ID de runtime: ${idPreview}`}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <IconPicker
                  label="Ícone"
                  value={draft.iconID}
                  onChange={(id) => setDraft((d) => ({ ...d, iconID: id }))}
                  background={draft.background}
                  foreground={draft.foreground}
                />
                <div className="space-y-3">
                  <ColorPicker
                    label="Cor de fundo"
                    value={draft.background}
                    onChange={(hex) =>
                      setDraft((d) => ({ ...d, background: hex }))
                    }
                    contrastAgainst={draft.foreground}
                  />
                  <ColorPicker
                    label="Cor do texto"
                    value={draft.foreground}
                    onChange={(hex) =>
                      setDraft((d) => ({ ...d, foreground: hex }))
                    }
                    presets={DEFAULT_FG_PRESETS}
                    contrastAgainst={draft.background}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "role" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Setores que este agente atende</Label>
                <TagInput
                  value={draft.departments}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, departments: next }))
                  }
                  placeholder="Ex.: vendas, suporte, financeiro"
                  ariaLabel="Setores"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dados que pede na triagem</Label>
                <TagInput
                  value={draft.triageFields}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, triageFields: next }))
                  }
                  placeholder="Ex.: nome, contato, assunto"
                  ariaLabel="Dados de triagem"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Os demais campos do papel ficam disponíveis na aba "Papel" depois
                que o agente for criado.
              </p>
            </div>
          )}

          {step === "prompt" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wizard-short">Resumo do prompt</Label>
                <Input
                  id="wizard-short"
                  value={draft.shortDescription}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, shortDescription: e.target.value }))
                  }
                  placeholder="Frase curta sobre como este agente atua"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-presentation">Contrato de atuação</Label>
                <Textarea
                  id="wizard-presentation"
                  value={draft.presentation}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, presentation: e.target.value }))
                  }
                  className="min-h-32 resize-none text-sm"
                  placeholder="Descreva como o agente deve se apresentar, o que faz e o que não faz."
                />
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="border-border/60 rounded-xl border p-4">
                <h3 className="text-sm font-semibold">{draft.name || idPreview}</h3>
                <p className="text-muted-foreground text-xs">
                  Template: <span className="font-medium">{tmpl?.name ?? "—"}</span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Field label="ID" value={idPreview} mono />
                  <Field label="Ícone" value={draft.iconID} />
                  <Field label="Fundo" value={draft.background} mono />
                  <Field label="Texto" value={draft.foreground} mono />
                  <Field
                    label="Setores"
                    value={draft.departments.join(", ") || "—"}
                  />
                  <Field
                    label="Triagem"
                    value={draft.triageFields.join(", ") || "—"}
                  />
                </dl>
              </div>
              {onTest && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={isSubmitting}
                  className="w-full"
                >
                  Testar antes de ativar
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="border-border/40 flex items-center justify-between gap-2 border-t px-6 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={stepIndex === 0 || isSubmitting}
            className="gap-1"
          >
            <IconArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            {step === "review" ? (
              <Button
                type="button"
                size="sm"
                onClick={handleFinish}
                disabled={isSubmitting || !canAdvance}
                className="gap-1"
              >
                {isSubmitting ? (
                  <IconLoader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <IconCheck className="size-4" aria-hidden="true" />
                )}
                Criar agente
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={next}
                disabled={!canAdvance || isSubmitting}
                className="gap-1"
              >
                Avançar
                <IconArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className={cn("text-foreground", mono && "font-mono")}>{value}</dd>
    </div>
  )
}
