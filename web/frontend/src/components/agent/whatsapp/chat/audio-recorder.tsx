import {
  IconLoader2,
  IconMicrophone,
  IconSend,
  IconTrash,
} from "@tabler/icons-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  type AudioClip,
  type UseAudioRecorderResult,
} from "@/hooks/whatsapp/use-audio-recorder"

export interface AudioRecorderProps {
  recorder: UseAudioRecorderResult
  /** Click handler for the entry-point microphone (delegates to recorder.start). */
  onStart: () => void
  onSend: (clip: AudioClip) => void
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function AudioRecorder({
  recorder,
  onStart,
  onSend,
}: AudioRecorderProps) {
  const { state, elapsedMs, waveform, cancel, stop } = recorder
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Paint the live waveform onto the canvas whenever the buffer ticks.
  useEffect(() => {
    if (!waveform || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const barCount = Math.min(waveform.length, 32)
    const barWidth = width / barCount
    for (let i = 0; i < barCount; i++) {
      const value = waveform[i]! / 255
      const barHeight = Math.max(2, value * height * 0.9)
      const x = i * barWidth + barWidth * 0.15
      const y = (height - barHeight) / 2
      // Read the live token so the waveform inherits theme (light/dark).
      ctx.fillStyle =
        getComputedStyle(canvas)
          .getPropertyValue("--wa-brand")
          .trim() || "#25d366"
      ctx.fillRect(x, y, barWidth * 0.7, barHeight)
    }
  }, [waveform])

  if (state === "idle" || state === "stopped" || state === "error") {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={onStart}
            aria-label="Gravar mensagem de áudio"
          >
            <IconMicrophone className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Gravar áudio</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="border-border/60 bg-background flex flex-1 items-center gap-2 rounded-xl border px-2 py-1.5"
      role="region"
      aria-label="Gravando áudio"
    >
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive size-8 shrink-0"
            onClick={cancel}
            aria-label="Descartar gravação"
          >
            <IconTrash className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Descartar</TooltipContent>
      </Tooltip>

      <span className="bg-destructive size-2 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
      <span className="text-foreground/75 w-12 shrink-0 text-[11px] tabular-nums">
        {state === "requesting" ? "—:—" : formatDuration(elapsedMs)}
      </span>

      <canvas
        ref={canvasRef}
        width={160}
        height={28}
        className="h-7 flex-1 rounded"
        aria-label="Forma de onda do áudio"
      />

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            className="size-9 shrink-0 rounded-full bg-wa-brand text-white hover:bg-wa-brand-hover"
            onClick={async () => {
              const clip = await stop()
              if (clip) onSend(clip)
            }}
            disabled={state !== "recording"}
            aria-label="Enviar áudio"
          >
            {state === "requesting" ? (
              <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <IconSend className="size-4" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Enviar</TooltipContent>
      </Tooltip>
    </div>
  )
}
