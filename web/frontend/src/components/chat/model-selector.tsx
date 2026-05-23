import { useTranslation } from "react-i18next"

import type { ModelInfo } from "@/api/models"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ModelSelectorProps {
  defaultModelName: string
  apiKeyModels: ModelInfo[]
  oauthModels: ModelInfo[]
  localModels: ModelInfo[]
  onValueChange: (modelName: string) => void
}

const PROVIDER_ABBREVIATIONS: Record<string, string> = {
  anthropic: "ANT",
  azure: "AZ",
  copilot: "COP",
  deepseek: "DS",
  gemini: "GEM",
  google: "GOOG",
  groq: "GRQ",
  local: "LOC",
  lmstudio: "LMS",
  mistral: "MST",
  ollama: "OLL",
  openai: "OAI",
  openrouter: "OR",
  xai: "XAI",
}

const MODEL_TOKEN_LABELS: Record<string, string> = {
  chat: "Chat",
  claude: "Claude",
  deepseek: "DeepSeek",
  flash: "Flash",
  gemini: "Gemini",
  gpt: "GPT",
  haiku: "Haiku",
  instruct: "Instruct",
  llama: "Llama",
  mini: "Mini",
  mistral: "Mistral",
  nano: "Nano",
  opus: "Opus",
  preview: "Preview",
  pro: "Pro",
  qwen: "Qwen",
  sonnet: "Sonnet",
  turbo: "Turbo",
}

function abbreviateModelName(modelName: string): string {
  const raw = modelName.trim()
  if (!raw) return raw

  const normalized = raw.replace(/[/:_]+/g, "-")
  const segments = normalized.split("-").filter(Boolean)
  if (segments.length === 0) return raw

  const providerKey = segments[0]?.toLowerCase()
  const provider = PROVIDER_ABBREVIATIONS[providerKey]
  const modelSegments = provider ? segments.slice(1) : segments
  if (modelSegments.length === 0) return provider ?? raw

  if (modelSegments[0]?.toLowerCase() === "gpt" && modelSegments[1]) {
    const variant = modelSegments[1]
    const suffix = modelSegments
      .slice(2)
      .map(formatModelToken)
      .join(" ")
    return [provider, `GPT-${variant}`, suffix].filter(Boolean).join(" ")
  }

  const model = modelSegments.map(formatModelToken).join(" ")
  return [provider, model].filter(Boolean).join(" ")
}

function formatModelToken(token: string): string {
  const lower = token.toLowerCase()
  return MODEL_TOKEN_LABELS[lower] ?? token
}

export function ModelSelector({
  defaultModelName,
  apiKeyModels,
  oauthModels,
  localModels,
  onValueChange,
}: ModelSelectorProps) {
  const { t } = useTranslation()
  const visibleModels = [...apiKeyModels, ...oauthModels, ...localModels]
  const shouldShowSelectedFallback =
    defaultModelName !== "" &&
    !visibleModels.some((model) => model.model_name === defaultModelName)
  const hasGroupedModels = visibleModels.length > 0

  return (
    <Select value={defaultModelName} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        className="text-muted-foreground hover:text-foreground focus-visible:border-input h-8 max-w-[160px] min-w-[80px] bg-transparent shadow-none focus-visible:ring-0 sm:max-w-[220px]"
      >
        <SelectValue placeholder={t("chat.noModel")}>
          {defaultModelName ? abbreviateModelName(defaultModelName) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {shouldShowSelectedFallback && (
          <>
            <SelectGroup>
              <SelectItem value={defaultModelName}>
                {abbreviateModelName(defaultModelName)}
              </SelectItem>
            </SelectGroup>
            {hasGroupedModels && <SelectSeparator />}
          </>
        )}

        {apiKeyModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("chat.modelGroup.apikey")}</SelectLabel>
            {apiKeyModels.map((model) => (
              <SelectItem key={model.index} value={model.model_name}>
                {abbreviateModelName(model.model_name)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {apiKeyModels.length > 0 &&
          (oauthModels.length > 0 || localModels.length > 0) && (
            <SelectSeparator />
          )}

        {oauthModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("chat.modelGroup.oauth")}</SelectLabel>
            {oauthModels.map((model) => (
              <SelectItem key={model.index} value={model.model_name}>
                {abbreviateModelName(model.model_name)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {oauthModels.length > 0 &&
          (localModels.length > 0 || apiKeyModels.length > 0) && (
            <SelectSeparator />
          )}

        {localModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("chat.modelGroup.local")}</SelectLabel>
            {localModels.map((model) => (
              <SelectItem key={model.index} value={model.model_name}>
                {abbreviateModelName(model.model_name)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
