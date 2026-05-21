import {
  IconAlertCircle,
  IconArrowRight,
  IconChecks,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"

import { listPendencias, type PendenciaItem } from "@/api/pendencias"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

function groupByFile(items: PendenciaItem[]): Record<string, PendenciaItem[]> {
  const out: Record<string, PendenciaItem[]> = {}
  for (const it of items) {
    if (!out[it.file]) out[it.file] = []
    out[it.file].push(it)
  }
  return out
}

export function PendenciasPage() {
  const query = useQuery({
    queryKey: ["pendencias"],
    queryFn: listPendencias,
    refetchInterval: 30_000,
  })

  const items = query.data?.items ?? []
  const grouped = useMemo(() => groupByFile(items), [items])
  const files = Object.keys(grouped).sort()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Pendências">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconRefresh className="size-4" />
          )}
          <span className="ml-1.5">Recarregar</span>
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Carregando pendências...
          </div>
        ) : query.isError ? (
          <div className="text-destructive flex items-start gap-2 text-sm">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {(query.error as Error)?.message || "Erro ao carregar pendências"}
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="border-border/40 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm">
            <IconChecks className="size-10 opacity-40" />
            <p className="font-medium">Nada pendente.</p>
            <p className="max-w-md text-center text-xs opacity-70">
              Quando algum agente flagar &quot;PENDENCIAS:&quot; em
              <code className="mx-1">memory/*.md</code>, os itens aparecem aqui
              para você completar.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-muted-foreground text-xs">
              {items.length} item{items.length === 1 ? "" : "s"} pendente
              {items.length === 1 ? "" : "s"} em {files.length} arquivo
              {files.length === 1 ? "" : "s"}. Estes campos foram solicitados
              pelos agentes — preencha em <code>Memória</code> para que eles
              passem a usar no próximo turno.
            </p>
            {files.map((file) => (
              <section
                key={file}
                className="border-border/40 bg-card rounded-lg border"
              >
                <header className="border-border/30 flex items-center justify-between border-b px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/90 text-sm font-medium">
                      {file}
                    </span>
                    <span className="text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 text-xs">
                      {grouped[file].length}
                    </span>
                  </div>
                  <Link
                    to="/memory"
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    Abrir no editor
                    <IconArrowRight className="size-3" />
                  </Link>
                </header>
                <ul className="divide-border/20 divide-y">
                  {grouped[file].map((item) => (
                    <li
                      key={`${file}-${item.line}`}
                      className="flex items-start gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="text-muted-foreground bg-muted/40 mt-0.5 rounded px-1.5 py-0.5 font-mono text-xs">
                        L{item.line}
                      </span>
                      <div className="min-w-0 flex-1">
                        {item.heading ? (
                          <p className="text-muted-foreground mb-0.5 text-xs uppercase tracking-wide opacity-70">
                            {item.heading}
                          </p>
                        ) : null}
                        <p className="text-foreground/90">{item.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
