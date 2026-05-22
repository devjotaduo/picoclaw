import { atom } from "jotai"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

export interface AgentEditorOrchestrationDraft {
  profileName: string
  profileIcon: string
  profileInitials: string
  profileBackground: string
  profileForeground: string
  profileImageURL: string
  roleConfigDraft: string
  mainAgentID: string
  mainAllowAgents: string[]
  assistantPhones: string[]
  assistantGroups: string[]
}

export interface AgentEditorSnapshot {
  templatePayload: TemplateApplyPayload | null
  orchestration: AgentEditorOrchestrationDraft
}

export const EMPTY_ORCHESTRATION: AgentEditorOrchestrationDraft = {
  profileName: "",
  profileIcon: "",
  profileInitials: "",
  profileBackground: "",
  profileForeground: "",
  profileImageURL: "",
  roleConfigDraft: "",
  mainAgentID: "main",
  mainAllowAgents: [],
  assistantPhones: [],
  assistantGroups: [],
}

export const EMPTY_SNAPSHOT: AgentEditorSnapshot = {
  templatePayload: null,
  orchestration: EMPTY_ORCHESTRATION,
}

export const baselineAtom = atom<AgentEditorSnapshot>(EMPTY_SNAPSHOT)
export const draftAtom = atom<AgentEditorSnapshot>(EMPTY_SNAPSHOT)
export const saveStateAtom = atom<SaveState>("idle")
export const lastSavedAtAtom = atom<number | null>(null)
export const saveErrorAtom = atom<string | null>(null)

export const isDirtyAtom = atom((get) => {
  const baseline = get(baselineAtom)
  const draft = get(draftAtom)
  return !shallowSnapshotEqual(baseline, draft)
})

function shallowSnapshotEqual(
  a: AgentEditorSnapshot,
  b: AgentEditorSnapshot,
): boolean {
  return (
    serialize(a.templatePayload) === serialize(b.templatePayload) &&
    serialize(a.orchestration) === serialize(b.orchestration)
  )
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
