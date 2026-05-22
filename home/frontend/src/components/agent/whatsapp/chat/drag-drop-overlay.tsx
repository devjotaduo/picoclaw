import { IconUpload } from "@tabler/icons-react"

export interface DragDropOverlayProps {
  visible: boolean
}

export function DragDropOverlay({ visible }: DragDropOverlayProps) {
  if (!visible) return null
  return (
    <div
      className="bg-primary/8 ring-primary/40 ring-dashed pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl ring-2 backdrop-blur-[2px]"
      role="presentation"
      aria-hidden="true"
    >
      <div className="bg-background flex flex-col items-center gap-2 rounded-xl border px-6 py-5 shadow-lg">
        <IconUpload className="text-primary size-7" aria-hidden="true" />
        <p className="text-sm font-semibold">Solte o arquivo para anexar</p>
        <p className="text-foreground/60 text-xs">
          Imagens, vídeos e documentos
        </p>
      </div>
    </div>
  )
}
