import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconFileText,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  getMemoryFile,
  listMemoryFiles,
  saveMemoryFile,
  type MemoryFile,
} from "@/api/workspace-memory"
import { CodeEditor } from "@/components/code-editor"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatRelative(ts: string): string {
  if (!ts) return ""
  try {
    const date = new Date(ts)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return "agora"
    if (diffMin < 60) return `há ${diffMin} min`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `há ${diffHr} h`
    return date.toLocaleDateString("pt-BR")
  } catch {
    return ts
  }
}

export function MemoryPage() {
  const qc = useQueryClient()
  const filesQuery = useQuery({
    queryKey: ["workspace-memory-list"],
    queryFn: listMemoryFiles,
    refetchInterval: 30_000,
  })

  const files = useMemo<MemoryFile[]>(
    () => filesQuery.data?.files ?? [],
    [filesQuery.data],
  )

  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (selected) return
    if (files.length > 0) setSelected(files[0].name)
  }, [files, selected])

  const detailQuery = useQuery({
    queryKey: ["workspace-memory-file", selected],
    queryFn: () => getMemoryFile(selected as string),
    enabled: Boolean(selected),
  })

  const [draft, setDraft] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data.content)
      setDirty(false)
    }
  }, [detailQuery.data])

  const handleSave = async () => {
    if (!selected || !dirty) return
    setSaving(true)
    try {
      const res = await saveMemoryFile(selected, draft)
      setDirty(false)
      toast.success("Memória salva", {
        description: res.backup_path
          ? `Backup criado: ${res.backup_path.split("/").pop()}`
          : "Sem versão anterior — primeira gravação.",
      })
      await qc.invalidateQueries({ queryKey: ["workspace-memory-list"] })
      await qc.invalidateQueries({
        queryKey: ["workspace-memory-file", selected],
      })
      await qc.invalidateQueries({ queryKey: ["pendencias"] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao salvar", { description: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Memória da empresa">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => filesQuery.refetch()}
          disabled={filesQuery.isFetching}
        >
          {filesQuery.isFetching ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconRefresh className="size-4" />
          )}
          <span className="ml-1.5">Recarregar</span>
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving || !selected}
        >
          {saving ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconDeviceFloppy className="size-4" />
          )}
          <span className="ml-1.5">Salvar</span>
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 gap-3 px-6 pb-6">
        <aside className="border-border/40 bg-card flex w-72 flex-col overflow-hidden rounded-lg border">
          <header className="border-border/30 border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Arquivos de memória
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filesQuery.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                <IconLoader2 className="size-4 animate-spin" />
                Carregando...
              </div>
            ) : filesQuery.isError ? (
              <div className="text-destructive flex items-start gap-2 p-4 text-sm">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {(filesQuery.error as Error)?.message ||
                    "Falha ao listar memória"}
                </span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-muted-foreground p-4 text-sm">
                Nenhum arquivo em <code>workspace/memory/</code>.
              </div>
            ) : (
              <ul>
                {files.map((file) => {
                  const active = file.name === selected
                  return (
                    <li key={file.name}>
                      <button
                        type="button"
                        onClick={() => setSelected(file.name)}
                        className={cn(
                          "border-border/20 hover:bg-muted/60 group flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm transition",
                          active && "bg-accent/60",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <IconFileText className="size-3.5 opacity-60" />
                          <span className="font-medium">{file.name}</span>
                        </span>
                        <span className="text-muted-foreground flex items-center gap-2 text-xs">
                          <IconClock className="size-3" />
                          {formatRelative(file.updated_at)}
                          {file.backup_count > 0 ? (
                            <span className="ml-auto opacity-70">
                              {file.backup_count} backup
                              {file.backup_count > 1 ? "s" : ""}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {selected ? (
                <>
                  Editando <code className="text-foreground">{selected}</code>
                </>
              ) : (
                "Selecione um arquivo"
              )}
            </span>
            <span className="flex items-center gap-2">
              {dirty ? (
                <span className="text-warning">Alterações não salvas</span>
              ) : detailQuery.data ? (
                <span className="flex items-center gap-1 text-success">
                  <IconCheck className="size-3" />
                  Sincronizado
                </span>
              ) : null}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {selected ? (
              <CodeEditor
                language="markdown"
                value={draft}
                onChange={(value) => {
                  setDraft(value)
                  setDirty(value !== (detailQuery.data?.content ?? ""))
                }}
                ariaLabel={`Editor da memória ${selected}`}
                className="h-full"
              />
            ) : (
              <div className="border-border/40 text-muted-foreground flex h-full items-center justify-center rounded-lg border border-dashed text-sm">
                Selecione um arquivo à esquerda para editar.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
