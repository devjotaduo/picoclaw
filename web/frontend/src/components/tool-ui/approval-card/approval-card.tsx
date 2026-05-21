import { IconCheck, IconShieldCheck, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { ApprovalCardProps } from "./schema"

export function ApprovalCard({
  id,
  title,
  description,
  metadata,
  variant = "default",
  confirmLabel = "Aprovar",
  cancelLabel = "Recusar",
  choice,
  disabled,
  className,
  onConfirm,
  onCancel,
}: ApprovalCardProps) {
  const isDestructive = variant === "destructive"

  if (choice) {
    const approved = choice === "approved"

    return (
      <div
        className={cn(
          "bg-background/60 flex w-full items-center gap-3 rounded-lg border px-3 py-3",
          className,
        )}
        data-tool-ui-id={id}
        data-slot="approval-card"
        data-receipt="true"
        role="status"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            approved
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          {approved ? (
            <IconCheck className="size-4" aria-hidden="true" />
          ) : (
            <IconX className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">
            {approved ? "Aprovado" : "Recusado"}
          </p>
          <p className="text-muted-foreground line-clamp-1 text-xs">{title}</p>
        </div>
      </div>
    )
  }

  return (
    <article
      className={cn(
        "bg-background/50 rounded-lg border p-3",
        isDestructive && "border-destructive/30 bg-destructive/10",
        className,
      )}
      data-tool-ui-id={id}
      data-slot="approval-card"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            isDestructive
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <IconShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={`${id}-title`}
            className="text-foreground text-sm leading-5 font-semibold"
          >
            {title}
          </h3>
          {description ? (
            <p
              id={`${id}-description`}
              className="text-muted-foreground mt-1 text-xs leading-5"
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {metadata?.length ? (
        <dl className="border-border/60 mt-3 grid gap-1.5 border-t pt-3 text-xs">
          {metadata.map((entry) => (
            <div key={entry.key} className="flex justify-between gap-3">
              <dt className="text-muted-foreground shrink-0">{entry.key}</dt>
              <dd className="text-foreground min-w-0 truncate">
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => void onCancel?.()}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={isDestructive ? "destructive" : "default"}
          size="sm"
          disabled={disabled}
          onClick={() => void onConfirm?.()}
        >
          {confirmLabel}
        </Button>
      </div>
    </article>
  )
}
