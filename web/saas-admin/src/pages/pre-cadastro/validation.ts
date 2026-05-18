import { looksLikeSiteOrInstagram, onlyDigits, textValue, toStringArray } from "./helpers";
import type { Basic, BasicErrors, StepKey } from "./types";

export function getBasicErrors(basic: Basic): BasicErrors {
  const errors: BasicErrors = {};
  const email = basic.contact_email.trim();
  const whatsappDigits = onlyDigits(basic.contact_whatsapp);
  if (!basic.company_name.trim()) {
    errors.company_name = "Informe o nome da empresa.";
  }
  if (!basic.contact_name.trim()) {
    errors.contact_name = "Informe quem está respondendo.";
  }
  if (!email && !whatsappDigits) {
    errors.contact_email = "Informe e-mail ou WhatsApp para retomada.";
    errors.contact_whatsapp = "Informe e-mail ou WhatsApp para retomada.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.contact_email = "Use um e-mail válido (ex.: nome@empresa.com).";
  }
  if (whatsappDigits && whatsappDigits.length < 10) {
    errors.contact_whatsapp = "Inclua o DDD: (11) 99999-9999.";
  }
  if (basic.site_instagram.trim() && !looksLikeSiteOrInstagram(basic.site_instagram)) {
    errors.site_instagram = "Use um site válido ou @perfil.";
  }
  return errors;
}

export function getStepValidationMessage(
  step: StepKey,
  basic: Basic,
  answers: Record<string, unknown>,
): string {
  switch (step) {
    case "identity":
      if (Object.keys(getBasicErrors(basic)).length > 0) {
        return "Revise os dados básicos para continuar.";
      }
      return "";
    case "business":
      if (toStringArray(answers.segments).length === 0) {
        return "Escolha pelo menos um segmento.";
      }
      if (toStringArray(answers.business_models).length === 0) {
        return "Escolha o modelo de negócio.";
      }
      if (!textValue(answers.offer)) {
        return "Descreva em uma frase a oferta principal.";
      }
      return "";
    default:
      return "";
  }
}

export function getMinimumSubmissionMessage(
  basic: Basic,
  answers: Record<string, unknown>,
): string {
  if (Object.keys(getBasicErrors(basic)).length > 0) {
    return "Revise os dados básicos antes de gerar o resumo.";
  }
  if (toStringArray(answers.segments).length === 0 || toStringArray(answers.business_models).length === 0) {
    return "Revise o segmento e o modelo de negócio antes de gerar o resumo.";
  }
  if (!textValue(answers.offer)) {
    return "Revise a oferta principal antes de gerar o resumo.";
  }
  return "";
}
