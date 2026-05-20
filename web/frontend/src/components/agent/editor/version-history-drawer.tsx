import { IconHistory, IconRotate, IconTrash } from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import type { TemplateApplyPayload } from "@/components/agent/templates/types"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import {
  type DiffLine,
  deleteVersion,
  diffPayload,
  loadVersions,
} from "./version-history"

export interface VersionHistoryDrawerProps {
  open: boolean
  agentID: string
  currentPayload: TemplateApplyPayload | null
  onRestore: (payload: TemplateApplyPayload) => void
  onOpenChange: (open: boolean) => void
}

export function VersionHistoryDrawer({
  open,
  agentID,
  currentPayload,
  onRestore,
  onOpenChange,
}: VersionHistoryDrawerProps) {
  const queryClient = useQueryClient()
  const [selectedID, setSelectedID] = useState<string | null>(null)

  const versionsQuery = useQuery({
    queryKey: ["agent-versions", agentID],
    queryFn: () => loadVersions(agentID),
    enabled: open && Boolean(agentID),
    staleTime: 30_000,
  })

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data])

  useEffect(() => {
    if (!open) return
    if (
      versions.length > 0 &&
      (selectedID === null || !versions.some((v) => v.id === selectedID))
    ) {
      setSelectedID(versions[0]!.id)
    }
    if (versions.length === 0 && selectedID !== null) {
      setSelectedID(null)
    }
  }, [open, versions, selectedID])

  const selected = useMemo(
    () => versions.find((v) => v.id === selectedID) ?? null,
    [versions, selectedID],
  )

  const diff = useMemo(
    () => diffPayload(selected?.payload ?? null, currentPayload, 2),
    [selected, currentPayload],
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVersion(agentID, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-versions", agentID],
      })
    },
  })

  function handleDelete(id: string) {
    if (selectedID === id) setSelectedID(null)
    deleteMutation.mutate(id)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-border/40 border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <IconHistory className="size-4" aria-hidden="true" />
            Histórico de versões
          </SheetTitle>
          <SheetDescription>
            Sincronizado com o launcher; até 20 versões por agente. Recentes no
            topo.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[200px_1fr]">
          <aside className="border-border/40 min-h-0 overflow-y-auto border-b sm:border-r sm:border-b-0">
            {versionsQuery.isLoading ? (
              <p className="text-muted-foreground p-4 text-xs" role="status">
                Carregando versões…
              </p>
            ) : versions.length === 0 ? (
              <p className="text-muted-foreground p-4 text-xs">
                Nenhuma versão salva ainda. Versões são criadas automaticamente
                a cada salvamento bem-sucedido do prompt.
              </p>
            ) : (
              <ul role="list" className="divide-border/40 divide-y">
                {versions.map((v) => {
                  const active = v.id === selectedID
                  return (
                    <li key={v.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-1 px-3 py-2",
                          active && "bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedID(v.id)}
                          aria-pressed={active}
                          className="focus-visible:ring-ring flex-1 rounded text-left text-xs focus:outline-none focus-visible:ring-2"
                        >
                          <div className="font-medium">{v.label}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {new Date(v.createdAt).toLocaleString("pt-BR")}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(v.id)}
                          aria-label={`Excluir versão ${v.label}`}
                          className="text-muted-foreground hover:text-destructive focus-visible:ring-ring inline-flex size-6 shrink-0 items-center justify-center rounded focus:outline-none focus-visible:ring-2"
                        >
                          <IconTrash className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>
          <main className="flex min-h-0 flex-col">
            <div className="border-border/40 flex items-center justify-between gap-2 border-b px-4 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">
                  {selected ? selected.label : "Selecione uma versão"}
                </div>
                <div className="text-muted-foreground text-[10px]">
                  Diff em relação ao prompt atual
                </div>
              </div>
              {selected && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onRestore(selected.payload)}
                  className="gap-1.5"
                >
                  <IconRotate className="size-3.5" aria-hidden="true" />
                  Restaurar
                </Button>
              )}
            </div>
            <pre
              aria-label="Diff entre versões"
              className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed"
            >
              {selected ? (
                renderDiff(diff)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </pre>
          </main>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function renderDiff(lines: DiffLine[]) {
  return lines.map((line, idx) => (
    <span
      key={idx}
      className={cn(
        "block whitespace-pre-wrap",
        line.kind === "add" &&
          "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
        line.kind === "remove" &&
          "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
        line.kind === "context" && "text-muted-foreground",
      )}
    >
      {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}
      {line.value || " "}
    </span>
  ))
}
