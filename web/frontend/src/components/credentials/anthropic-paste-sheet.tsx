import { IconExternalLink, IconLoader2 } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface AnthropicPasteSheetProps {
  open: boolean
  authURL: string
  submitting: boolean
  flowHint: string
  onOpenChange: (open: boolean) => void
  onSubmit: (paste: string) => void
}

export function AnthropicPasteSheet({
  open,
  authURL,
  submitting,
  flowHint,
  onOpenChange,
  onSubmit,
}: AnthropicPasteSheetProps) {
  const { t } = useTranslation()
  const [paste, setPaste] = useState("")

  useEffect(() => {
    if (!open) {
      setPaste("")
    }
  }, [open])

  const trimmed = paste.trim()
  const disabled = submitting || trimmed === ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:!w-full data-[side=right]:sm:!w-[480px] data-[side=right]:sm:!max-w-[480px]"
      >
        <SheetHeader className="border-b-muted border-b px-6 py-5">
          <SheetTitle>{t("credentials.anthropicPaste.title")}</SheetTitle>
          <SheetDescription>
            {t("credentials.anthropicPaste.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6 py-5">
          {authURL && (
            <Button asChild variant="outline" className="w-full">
              <a href={authURL} target="_blank" rel="noreferrer">
                <IconExternalLink className="size-4" />
                {t("credentials.anthropicPaste.openAuth")}
              </a>
            </Button>
          )}

          <div>
            <label
              htmlFor="anthropic-paste"
              className="text-muted-foreground text-xs uppercase"
            >
              {t("credentials.anthropicPaste.codeLabel")}
            </label>
            <Input
              id="anthropic-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="code#state"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 font-mono"
            />
            <p className="text-muted-foreground mt-2 text-xs">
              {t("credentials.anthropicPaste.hint")}
            </p>
          </div>

          {flowHint && (
            <div className="bg-muted rounded-md border px-3 py-2 text-sm">
              {flowHint}
            </div>
          )}
        </div>

        <SheetFooter className="border-t-muted border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={disabled} onClick={() => onSubmit(trimmed)}>
            {submitting && <IconLoader2 className="size-4 animate-spin" />}
            {t("credentials.anthropicPaste.submit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
