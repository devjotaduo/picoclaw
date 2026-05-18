import { z } from "zod"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"

export type StepID =
  | "identity"
  | "role"
  | "prompt"
  | "knowledge"
  | "routing"

export interface StepValidation {
  id: StepID
  status: "complete" | "partial" | "empty" | "error"
  missing: string[]
}

export const identitySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  template_id: z.string().trim().min(1, "Selecione um template"),
  tone: z.string().optional(),
  language: z.string().optional(),
})

export const roleSchema = z
  .string()
  .transform((raw, ctx) => {
    if (!raw.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Perfil operacional vazio",
      })
      return z.NEVER
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        ctx.addIssue({
          code: "custom",
          message: "JSON deve ser um objeto",
        })
        return z.NEVER
      }
      return parsed as Record<string, unknown>
    } catch (err) {
      const message = err instanceof Error ? err.message : "JSON inválido"
      ctx.addIssue({ code: "custom", message })
      return z.NEVER
    }
  })

export const promptSchema = z
  .object({
    short_description: z.string().optional(),
    presentation: z.string().optional(),
    functions: z.array(z.string()).optional(),
  })
  .refine(
    (v) =>
      (v.short_description ?? "").trim().length +
        (v.presentation ?? "").trim().length >
      0,
    { message: "Adicione um resumo ou contrato de atuação" },
  )

const phoneRegex = /^\+?\d[\d\s()-]{8,18}$/

export const routingSchema = z.object({
  mainAgentID: z.string().min(1),
  assistantPhones: z.array(z.string().regex(phoneRegex, "Número inválido")),
  assistantGroups: z.array(z.string().min(1)),
})

export interface ChecklistInput {
  payload: TemplateApplyPayload | null
  roleConfigDraft: string
  mainAgentID: string
  assistantPhones: string[]
  assistantGroups: string[]
}

export function validateChecklist(input: ChecklistInput): StepValidation[] {
  const { payload, roleConfigDraft, mainAgentID, assistantPhones, assistantGroups } = input

  const identity = identitySchema.safeParse({
    name: payload?.name ?? "",
    template_id: payload?.template_id ?? "",
    tone: payload?.tone,
    language: payload?.language,
  })

  const role = roleSchema.safeParse(roleConfigDraft || "")

  const prompt = promptSchema.safeParse({
    short_description: payload?.short_description,
    presentation: payload?.presentation,
    functions: payload?.functions,
  })

  const skills = Array.isArray(payload?.skill_configs)
    ? payload.skill_configs.filter((s) => s.enabled !== false).length
    : 0
  const knowledgePresent = Boolean(
    payload?.modules?.professionals_enabled ||
      payload?.modules?.products_enabled ||
      (payload?.knowledge_base?.faqs && payload.knowledge_base.faqs.length > 0),
  )
  const knowledgeStep: StepValidation =
    skills > 0 || knowledgePresent
      ? { id: "knowledge", status: "complete", missing: [] }
      : { id: "knowledge", status: "partial", missing: ["Adicione ao menos uma skill ou um módulo de conhecimento"] }

  const routing = routingSchema.safeParse({
    mainAgentID,
    assistantPhones,
    assistantGroups,
  })

  return [
    toStep("identity", identity),
    toStep("role", role),
    toStep("prompt", prompt),
    knowledgeStep,
    toStep("routing", routing),
  ]
}

type SafeParse<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ReadonlyArray<{ message: string }> } }

function toStep<T>(
  id: StepID,
  result: SafeParse<T>,
  partialIfMissing = false,
): StepValidation {
  if (result.success) {
    return { id, status: "complete", missing: [] }
  }
  const missing = result.error.issues.map((issue) => issue.message)
  return {
    id,
    status: partialIfMissing ? "partial" : missing.length > 0 ? "error" : "empty",
    missing,
  }
}

export function isReadyToActivate(steps: StepValidation[]): boolean {
  return steps.every((s) => s.status === "complete" || s.status === "partial")
}
