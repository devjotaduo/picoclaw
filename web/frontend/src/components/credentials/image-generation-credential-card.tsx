import {
  IconKey,
  IconLoader2,
  IconPhoto,
  IconSparkles,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type React from "react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  type ImageGenerationConfigRequest,
  type ImageGenerationConfigResponse,
  getImageGenerationConfig,
  updateImageGenerationConfig,
} from "@/api/tools"
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
import { Switch } from "@/components/ui/switch"
import { showSaveSuccessOrRestartToast } from "@/lib/restart-required"
import { refreshGatewayState } from "@/store/gateway"

import { CredentialCard } from "./credential-card"

type ImageGenerationForm = ImageGenerationConfigResponse & {
  api_key: string
}

const sizeOptions = ["1024x1024", "1080x1080", "1080x1350", "1080x1920"]

function toForm(config: ImageGenerationConfigResponse): ImageGenerationForm {
  return {
    ...config,
    api_key: "",
  }
}

export function ImageGenerationCredentialCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ImageGenerationForm | null>(null)

  const configQuery = useQuery({
    queryKey: ["tools", "image-generation-config"],
    queryFn: getImageGenerationConfig,
  })

  useEffect(() => {
    if (configQuery.data) {
      setForm(toForm(configQuery.data))
    }
  }, [configQuery.data])

  const saveMutation = useMutation({
    mutationFn: updateImageGenerationConfig,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["tools", "image-generation-config"], updated)
      setForm(toForm(updated))
      const gateway = await refreshGatewayState({ force: true })
      showSaveSuccessOrRestartToast(
        t,
        t(
          "credentials.providers.imageGeneration.saveSuccess",
          "Configuração de imagem salva.",
        ),
        t("credentials.providers.imageGeneration.title", "Geração de imagem"),
        gateway?.restartRequired === true,
      )
      void queryClient.invalidateQueries({ queryKey: ["tools"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t(
              "credentials.providers.imageGeneration.saveError",
              "Falha ao salvar geração de imagem.",
            ),
      )
    },
  })

  const updateField = <Key extends keyof ImageGenerationForm>(
    key: Key,
    value: ImageGenerationForm[Key],
  ) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const save = () => {
    if (!form) {
      return
    }
    const payload: ImageGenerationConfigRequest = {
      enabled: form.enabled,
      api_base: form.api_base.trim(),
      model: form.model.trim(),
      size: form.size.trim(),
      output_dir: form.output_dir.trim(),
    }
    if (form.api_key.trim() !== "") {
      payload.api_key = form.api_key.trim()
    }
    saveMutation.mutate(payload)
  }

  const status =
    form?.enabled && form.api_key_set
      ? "connected"
      : form?.enabled
        ? "needs_refresh"
        : "not_logged_in"
  const busy = configQuery.isLoading || saveMutation.isPending

  return (
    <CredentialCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="border-muted inline-flex size-6 items-center justify-center rounded-full border">
            <IconPhoto className="size-3.5" />
          </span>
          <span>
            {t(
              "credentials.providers.imageGeneration.title",
              "Geração de imagem",
            )}
          </span>
        </span>
      }
      description={t(
        "credentials.providers.imageGeneration.description",
        "Usa o provedor configurado para gerar imagens reais pelos agentes.",
      )}
      status={status}
      authMethod={form?.recommended_provider ?? "OpenRouter"}
      details={
        <div className="space-y-1">
          <p className="truncate">
            {t("credentials.providers.imageGeneration.model", "Modelo")}:{" "}
            <span className="text-foreground font-mono">
              {form?.model ?? "google/gemini-2.5-flash-image"}
            </span>
          </p>
          <p>
            {t("credentials.providers.imageGeneration.key", "Chave")}:{" "}
            <span className="text-foreground">
              {form?.api_key_set
                ? (form.api_key_masked ?? "****")
                : t(
                    "credentials.providers.imageGeneration.notConfigured",
                    "pendente",
                  )}
            </span>
          </p>
          <p>
            {t("credentials.providers.imageGeneration.expiration", "Expiração")}
            :{" "}
            {t(
              "credentials.providers.imageGeneration.noExpiration",
              "não informada",
            )}
          </p>
        </div>
      }
      actions={
        <div className="border-muted flex flex-col gap-3 rounded-lg border p-3">
          {configQuery.isLoading || !form ? (
            <div className="text-muted-foreground flex h-[202px] items-center gap-2 text-sm">
              <IconLoader2 className="size-4 animate-spin" />
              {t("credentials.loading")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="image-generation-enabled" className="text-xs">
                  {t("credentials.providers.imageGeneration.enabled", "Ativar")}
                </Label>
                <Switch
                  id="image-generation-enabled"
                  checked={form.enabled}
                  disabled={busy}
                  onCheckedChange={(checked) => updateField("enabled", checked)}
                />
              </div>

              <Field
                id="image-generation-api-base"
                label={t(
                  "credentials.providers.imageGeneration.apiBase",
                  "API base",
                )}
              >
                <Input
                  id="image-generation-api-base"
                  value={form.api_base}
                  disabled={busy}
                  onChange={(event) =>
                    updateField("api_base", event.target.value)
                  }
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <Field
                  id="image-generation-size"
                  label={t(
                    "credentials.providers.imageGeneration.size",
                    "Tamanho",
                  )}
                >
                  <Select
                    value={form.size}
                    disabled={busy}
                    onValueChange={(value) => updateField("size", value)}
                  >
                    <SelectTrigger
                      id="image-generation-size"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeOptions.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  id="image-generation-api-key"
                  label={t(
                    "credentials.providers.imageGeneration.key",
                    "Chave",
                  )}
                >
                  <Input
                    id="image-generation-api-key"
                    value={form.api_key}
                    type="password"
                    disabled={busy}
                    placeholder={form.api_key_masked || "sk-or-v1-..."}
                    onChange={(event) =>
                      updateField("api_key", event.target.value)
                    }
                  />
                </Field>
              </div>

              <Field
                id="image-generation-model"
                label={t(
                  "credentials.providers.imageGeneration.model",
                  "Modelo",
                )}
              >
                <Input
                  id="image-generation-model"
                  value={form.model}
                  disabled={busy}
                  onChange={(event) => updateField("model", event.target.value)}
                />
              </Field>

              <Field
                id="image-generation-output-dir"
                label={t(
                  "credentials.providers.imageGeneration.outputDir",
                  "Diretório",
                )}
              >
                <Input
                  id="image-generation-output-dir"
                  value={form.output_dir}
                  disabled={busy}
                  onChange={(event) =>
                    updateField("output_dir", event.target.value)
                  }
                />
              </Field>

              <div className="bg-muted/40 text-muted-foreground rounded-md px-2.5 py-2 text-xs">
                {t(
                  "credentials.providers.imageGeneration.recommended",
                  "Recomendado",
                )}
                :{" "}
                <span className="text-foreground font-mono">
                  {form.recommended_model}
                </span>
              </div>
            </>
          )}
        </div>
      }
      footer={
        <Button
          size="sm"
          disabled={!form || busy}
          onClick={save}
          className="w-full justify-center"
        >
          {saveMutation.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : form?.api_key_set ? (
            <IconSparkles className="size-4" />
          ) : (
            <IconKey className="size-4" />
          )}
          {t("credentials.actions.saveToken")}
        </Button>
      }
    />
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {children}
    </div>
  )
}
