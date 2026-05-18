import { IconTrash, IconUpload, IconUser } from "@tabler/icons-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const MAX_INPUT_BYTES = 2 * 1024 * 1024
const MAX_DIMENSION = 256
const MAX_DATA_URL_BYTES = 512 * 1024
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]

async function fileToDataURL(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    const text = await file.text()
    const base64 = btoa(unescape(encodeURIComponent(text)))
    return `data:image/svg+xml;base64,${base64}`
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas context unavailable")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  for (const quality of [0.92, 0.85, 0.75, 0.6, 0.45]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality)
    if (dataUrl.length <= MAX_DATA_URL_BYTES) return dataUrl
  }
  return canvas.toDataURL("image/jpeg", 0.4)
}

export function AvatarUpload({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const hasImage = value.trim().length > 0

  const processFile = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      toast.error("Formato inválido. Use PNG, JPG, SVG ou WebP.")
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("Imagem maior que 2 MB.")
      return
    }
    setBusy(true)
    try {
      onChange(await fileToDataURL(file))
    } catch (err) {
      console.error(err)
      toast.error("Falha ao processar imagem")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const onPick = () => inputRef.current?.click()

  if (hasImage) {
    return (
      <div className="flex items-center gap-4">
        <img
          src={value}
          alt="Avatar do agente"
          className="border-border/60 size-24 rounded-full border object-cover"
        />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPick}
              disabled={disabled || busy}
            >
              <IconUpload className="size-3.5" aria-hidden="true" />
              Trocar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              disabled={disabled || busy}
            >
              <IconTrash className="size-3.5" aria-hidden="true" />
              Remover
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">PNG, JPG ou SVG · até 2 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => processFile(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (disabled) return
        const file = e.dataTransfer.files?.[0]
        void processFile(file)
      }}
      disabled={disabled || busy}
      className={[
        "border-border/60 hover:border-primary/60 hover:bg-muted/40 focus-visible:ring-primary/30",
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
        "px-6 py-8 text-center transition-colors focus:outline-none focus-visible:ring-2",
        dragOver ? "border-primary bg-primary/5" : "",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
      aria-label="Carregar imagem do avatar"
    >
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        {busy ? (
          <IconUpload className="size-5 animate-pulse" aria-hidden="true" />
        ) : (
          <IconUser className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="text-sm font-medium">Arraste uma imagem ou clique para enviar</div>
      <div className="text-muted-foreground text-xs">PNG, JPG ou SVG · até 2 MB</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => processFile(e.target.files?.[0])}
      />
    </button>
  )
}
