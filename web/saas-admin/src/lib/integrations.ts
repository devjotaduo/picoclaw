import type {
  IntegrationField,
  IntegrationStatus,
  SkillIntegration,
  UpdateIntegrationInput,
} from "@/api/integrations";

export type IntegrationDraft = UpdateIntegrationInput;

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  configured: "Configurado",
  pending: "Pendente",
  schema_invalid: "Schema inválido",
};

export function createIntegrationDraft(integration: SkillIntegration): IntegrationDraft {
  return {
    values: { ...(integration.values ?? {}) },
    secrets: {},
    clear_secrets: [],
  };
}

export function setDraftValue(
  draft: IntegrationDraft,
  field: IntegrationField,
  value: unknown,
): IntegrationDraft {
  return {
    ...draft,
    values: {
      ...draft.values,
      [field.key]: normalizeDraftValue(field, value),
    },
  };
}

export function setDraftSecret(
  draft: IntegrationDraft,
  key: string,
  value: string,
): IntegrationDraft {
  const secrets = { ...draft.secrets };
  if (value === "") {
    delete secrets[key];
  } else {
    secrets[key] = value;
  }
  return {
    ...draft,
    secrets,
    clear_secrets: draft.clear_secrets.filter((item) => item !== key),
  };
}

export function setDraftSecretCleared(
  draft: IntegrationDraft,
  key: string,
  clear: boolean,
): IntegrationDraft {
  const secrets = { ...draft.secrets };
  delete secrets[key];
  return {
    ...draft,
    secrets,
    clear_secrets: clear
      ? Array.from(new Set([...draft.clear_secrets, key]))
      : draft.clear_secrets.filter((item) => item !== key),
  };
}

export function normalizeDraftValue(field: IntegrationField, value: unknown): unknown {
  if (field.type === "boolean") {
    return Boolean(value);
  }
  if (field.type === "multiselect") {
    return Array.isArray(value) ? value.map(String) : [];
  }
  return value;
}
