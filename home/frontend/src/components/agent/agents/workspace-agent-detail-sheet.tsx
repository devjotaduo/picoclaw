import {
  IconFileCode,
  IconLoader2,
  IconRobot,
  IconX,
} from "@tabler/icons-react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import type {
  WorkspaceAgent,
  WorkspaceAgentDetail,
} from "@/api/workspace-agents"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type DetailView = "preview" | "raw"

interface WorkspaceAgentDetailSheetProps {
  open: boolean
  selectedAgent: WorkspaceAgent | null
  selectedAgentDetail?: WorkspaceAgentDetail
  isLoading: boolean
  error: unknown
  onOpenChange: (open: boolean) => void
}

export function WorkspaceAgentDetailSheet({
  open,
  selectedAgent,
  selectedAgentDetail,
  isLoading,
  error,
  onOpenChange,
}: WorkspaceAgentDetailSheetProps) {
  const [detailView, setDetailView] = useState<DetailView>("preview")
  const activeAgent = selectedAgentDetail ?? selectedAgent

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 shadow-2xl data-[side=right]:!w-full data-[side=right]:sm:!w-[720px] data-[side=right]:sm:!max-w-[720px]"
      >
        <SheetHeader className="bg-muted/10 border-b px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 ring-primary/20 text-primary flex size-10 items-center justify-center rounded-lg ring-1">
              <IconRobot className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-left">
              <SheetTitle className="truncate text-xl font-semibold tracking-tight">
                {activeAgent?.name ?? "Agente"}
              </SheetTitle>
              <SheetDescription className="line-clamp-2">
                {activeAgent?.role ?? "Arquivo Markdown do workspace"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-x-hidden overflow-y-scroll px-6 py-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <IconLoader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-destructive border-destructive/20 bg-destructive/5 flex h-40 flex-col items-center justify-center gap-3 rounded-lg border">
              <IconX className="size-6 opacity-80" />
              <span className="text-sm font-medium">
                Não foi possível carregar o arquivo Markdown.
              </span>
            </div>
          ) : selectedAgentDetail ? (
            <div className="space-y-6">
              <div className="border-border/70 bg-muted/20 inline-flex rounded-lg border p-1 shadow-sm">
                {(["preview", "raw"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={cn(
                      "rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-200",
                      detailView === view
                        ? "bg-background text-foreground ring-border/30 shadow-[0_1px_3px_rgba(0,0,0,0.1)] ring-1"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                    onClick={() => setDetailView(view)}
                  >
                    {view === "preview" ? "Preview" : "Markdown"}
                  </button>
                ))}
              </div>

              {detailView === "preview" ? (
                <div className="prose prose-zinc dark:prose-invert prose-sm sm:prose-base prose-pre:rounded-xl prose-pre:border prose-pre:border-border/40 prose-pre:bg-zinc-100 prose-pre:p-0 prose-pre:shadow-sm dark:prose-pre:bg-zinc-950/90 prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                  >
                    {selectedAgentDetail.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="border-border/50 overflow-x-auto rounded-lg border bg-zinc-950 p-5 shadow-sm">
                  <pre className="font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-zinc-100/90">
                    <code>{selectedAgentDetail.content}</code>
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 text-sm">
              <IconFileCode className="size-5" />
              Selecione um agente.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
