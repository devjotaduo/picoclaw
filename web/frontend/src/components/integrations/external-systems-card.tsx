import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
  IconPlugConnected,
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  type IntegrationEntry,
  type ValidateReadinessResponse,
  getValidateReadiness,
  markIntegrationResolved,
} from "@/api/validate-readiness"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const VALIDATE_READINESS_KEY = ["workspace-validate-readiness"] as const

function humanizeKey(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim()
}

function ItemRow({
  item,
  onResolve,
  pending,
}: {
  item: IntegrationEntry
  onResolve: (key: string) => void
  pending: boolean
}) {
  const resolved = item.status === "resolved"
  return (
    <li className="border-border/40 flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          {resolved ? (
            <Badge
              variant="default"
              className="border border-emerald-600/30 bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/20"
            >
              Resolvida
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-600/30 bg-amber-600/10 text-amber-600 dark:text-amber-400"
            >
              Pendente
            </Badge>
          )}
          <span className="text-foreground/90 text-sm font-medium">
            {humanizeKey(item.key)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {item.admin_action}
        </p>
      </div>
      {!resolved ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(item.key)}
          disabled={pending}
          className="shrink-0"
        >
          {pending ? (
            <IconLoader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <IconCheck className="mr-1.5 size-4" />
          )}
          Marcar como resolvida
        </Button>
      ) : null}
    </li>
  )
}

export function ExternalSystemsCard() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: VALIDATE_READINESS_KEY,
    queryFn: getValidateReadiness,
    staleTime: 15_000,
  })

  const mutation = useMutation({
    mutationFn: (key: string) => markIntegrationResolved(key),
    onSuccess: (updated, key) => {
      qc.setQueryData<ValidateReadinessResponse>(VALIDATE_READINESS_KEY, updated)
      toast.success("Integração marcada como resolvida", {
        description: humanizeKey(key),
      })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao marcar como resolvida", { description: msg })
    },
  })

  const items = query.data?.integracoes_required ?? []

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600">
            <IconPlugConnected className="size-5 text-white" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base">
              Sistemas externos detectados pelo discovery
            </CardTitle>
            <CardDescription className="mt-0.5 text-sm leading-relaxed">
              Integrações técnicas que a equipe precisa pra atender sem
              inventar. Marque como resolvida quando configurada externamente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pt-0">
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Carregando...
          </div>
        ) : query.isError ? (
          <div className="text-destructive flex items-start gap-2 py-2 text-sm">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {(query.error as Error)?.message ||
                "Erro ao carregar integrações requeridas"}
            </span>
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">
            Nenhuma integração de sistema externo detectada.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                onResolve={(key) => mutation.mutate(key)}
                pending={
                  mutation.isPending && mutation.variables === item.key
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
