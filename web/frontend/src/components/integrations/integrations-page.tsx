import {
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconLoader2,
  IconWebhook,
} from "@tabler/icons-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import {
  type SaveIntegrationPayload,
  getIntegrationStatus,
  saveIntegrationConfig,
} from "@/api/integrations"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <Badge
        variant="default"
        className="border border-emerald-600/30 bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/20"
      >
        Configurado
      </Badge>
    )
  }
  return (
    <Badge
      variant="destructive"
      className="border border-red-600/30 opacity-90"
    >
      Não configurado
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// BufferCard
// ---------------------------------------------------------------------------

function BufferCard({ configured }: { configured: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState("")
  const [profileId, setProfileId] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!token.trim() && !profileId.trim()) {
      toast.error("Campos vazios", {
        description: "Preencha pelo menos o Access Token para salvar.",
      })
      return
    }
    setSaving(true)
    try {
      const payload: SaveIntegrationPayload = {}
      if (token.trim()) payload.buffer_access_token = token.trim()
      if (profileId.trim())
        payload.buffer_instagram_profile_id = profileId.trim()
      await saveIntegrationConfig(payload)
      toast.success("Buffer configurado", {
        description: "Credenciais salvas com sucesso.",
      })
      setOpen(false)
      await qc.invalidateQueries({ queryKey: ["integration-status"] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao salvar", { description: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <IconBrandInstagram className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">
                Buffer — Publicação no Instagram
              </CardTitle>
              <CardDescription className="mt-0.5 text-sm leading-relaxed">
                Publique e agende posts no Instagram via Buffer API. Gratuito
                até 10 posts na fila.
              </CardDescription>
            </div>
          </div>
          <StatusBadge configured={configured} />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>{open ? "Fechar" : "Configurar"}</span>
          {open ? (
            <IconChevronUp className="size-4 opacity-60" />
          ) : (
            <IconChevronDown className="size-4 opacity-60" />
          )}
        </Button>

        {open && (
          <div
            className="border-border/40 mt-4 space-y-4 border-t pt-4"
            role="region"
            aria-label="Formulário Buffer"
          >
            <div className="space-y-1.5">
              <Label htmlFor="buffer-token">Access Token</Label>
              <Input
                id="buffer-token"
                type="password"
                placeholder="buf_live_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="buffer-profile">Profile ID do Instagram</Label>
              <Input
                id="buffer-profile"
                type="text"
                placeholder="1234567890"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                ) : null}
                Salvar
              </Button>
              <a
                href="https://buffer.com/developers/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                Como configurar
                <IconExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// MakeCard
// ---------------------------------------------------------------------------

function MakeCard({ configured }: { configured: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Campo vazio", {
        description: "Informe a URL do webhook para salvar.",
      })
      return
    }
    setSaving(true)
    try {
      await saveIntegrationConfig({
        make_instagram_webhook_url: webhookUrl.trim(),
      })
      toast.success("Make.com configurado", {
        description: "URL do webhook salva com sucesso.",
      })
      setOpen(false)
      await qc.invalidateQueries({ queryKey: ["integration-status"] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao salvar", { description: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <IconWebhook className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">
                Make.com — Webhook Instagram
              </CardTitle>
              <CardDescription className="mt-0.5 text-sm leading-relaxed">
                Publique no Instagram via webhook Make.com. Alternativa ao
                Buffer para até 1.000 operações/mês.
              </CardDescription>
            </div>
          </div>
          <StatusBadge configured={configured} />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>{open ? "Fechar" : "Configurar"}</span>
          {open ? (
            <IconChevronUp className="size-4 opacity-60" />
          ) : (
            <IconChevronDown className="size-4 opacity-60" />
          )}
        </Button>

        {open && (
          <div
            className="border-border/40 mt-4 space-y-4 border-t pt-4"
            role="region"
            aria-label="Formulário Make.com"
          >
            <div className="space-y-1.5">
              <Label htmlFor="make-webhook">URL do Webhook</Label>
              <Input
                id="make-webhook"
                type="text"
                placeholder="https://hook.eu2.make.com/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                ) : null}
                Salvar
              </Button>
              <a
                href="https://www.make.com/en/help/tools/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                Como configurar
                <IconExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WhatsAppCard
// ---------------------------------------------------------------------------

function WhatsAppCard() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600">
              <IconBrandWhatsapp className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">WhatsApp Business</CardTitle>
              <CardDescription className="mt-0.5 text-sm leading-relaxed">
                Canal WhatsApp configurado via QR Code nas Configurações de
                Canais.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-muted-foreground shrink-0 text-xs"
          >
            Ver em Canais
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Button variant="outline" size="sm" asChild>
          <Link to="/channels/$name" params={{ name: "whatsapp_native" }}>
            Ir para Canais →
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// IntegrationsPage
// ---------------------------------------------------------------------------

export function IntegrationsPage() {
  const statusQuery = useQuery({
    queryKey: ["integration-status"],
    queryFn: getIntegrationStatus,
    staleTime: 30_000,
  })

  const status = statusQuery.data

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Integrações" />

      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-8">
        <p className="text-muted-foreground mb-6 max-w-2xl text-sm leading-relaxed">
          Conecte serviços externos para ampliar as capacidades dos seus
          agentes.
        </p>

        <div className="grid max-w-4xl gap-4 sm:grid-cols-1 lg:grid-cols-2">
          <BufferCard configured={status?.bufferConfigured ?? false} />
          <MakeCard configured={status?.makeConfigured ?? false} />
          <WhatsAppCard />
        </div>
      </div>
    </div>
  )
}
