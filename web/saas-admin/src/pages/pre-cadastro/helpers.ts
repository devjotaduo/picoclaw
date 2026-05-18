import { businessModels, businessSegments } from "./constants";

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => String(item).trim()).filter((item) => item && item !== "<nil>")),
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(value.split(",").map((item) => item.trim()).filter((item) => item && item !== "<nil>")),
    );
  }
  return [];
}

export function textValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text && text !== "<nil>" ? text : "";
}

export function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "a confirmar";
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskPhone(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length < 3) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length < 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function looksLikeSiteOrInstagram(value: string): boolean {
  const text = value.trim();
  if (/^@[\w.]{2,30}$/.test(text)) return true;
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function withBusinessType(answers: Record<string, unknown>): Record<string, unknown> {
  const businessType = [...toStringArray(answers.segments), ...toStringArray(answers.business_models)];
  if (businessType.length === 0) return answers;
  return { ...answers, business_type: businessType.join(", ") };
}

export function normalizeHydratedAnswers(rawAnswers: Record<string, unknown>): Record<string, unknown> {
  const next = { ...rawAnswers };
  const selectedSegments = toStringArray(next.segments);
  const selectedModels = toStringArray(next.business_models);
  const legacyValues = toStringArray(next.business_type);
  if (selectedSegments.length === 0) {
    const migrated = legacyValues.filter((value) => businessSegments.includes(value));
    if (migrated.length > 0) next.segments = migrated;
  }
  if (selectedModels.length === 0) {
    const migrated = legacyValues.filter((value) => businessModels.includes(value));
    if (migrated.length > 0) next.business_models = migrated;
  }
  return withBusinessType(next);
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "error" in e) {
    return String((e as { error: unknown }).error);
  }
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}

export function syncResumeUrl(id: string, token: string): void {
  if (!id || !token) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("id") === id && url.searchParams.get("token") === token) return;
  url.searchParams.set("id", id);
  url.searchParams.set("token", token);
  window.history.replaceState({}, "", url);
}
