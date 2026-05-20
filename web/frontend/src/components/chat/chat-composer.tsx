import {
  IconArrowUp,
  IconMicrophone,
  IconPhotoPlus,
  IconPlayerStopFilled,
  IconX,
} from "@tabler/icons-react"
import type { KeyboardEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import TextareaAutosize from "react-textarea-autosize"
import { toast } from "sonner"

import { ContextUsageRing } from "@/components/chat/context-usage-ring"
import { RecordingWaveform } from "@/components/chat/recording-waveform"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatAttachment, ContextUsage } from "@/store/chat"

export type ChatInputDisabledReason =
  | "gatewayUnknown"
  | "gatewayStarting"
  | "gatewayRestarting"
  | "gatewayStopping"
  | "gatewayStopped"
  | "gatewayError"
  | "websocketConnecting"
  | "websocketDisconnected"
  | "websocketError"
  | "noDefaultModel"

interface ChatComposerProps {
  input: string
  attachments: ChatAttachment[]
  onInputChange: (value: string) => void
  onAddImages: () => void
  onAttachAudio: (attachment: ChatAttachment) => void
  onRemoveAttachment: (index: number) => void
  onSend: () => void
  onContextDetail?: () => void
  inputDisabledReason: ChatInputDisabledReason | null
  canSend: boolean
  contextUsage?: ContextUsage
}

// Max audio recording length in seconds. Anything longer is auto-stopped to
// keep the base64 payload under the DefaultMaxMediaSize budget on the server.
const MAX_AUDIO_RECORDING_SECONDS = 120

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

// Picks the best mime supported by the browser; Safari historically lacked
// webm/opus, so we fall back to mp4/wav.
function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/wav",
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ""
}

export function ChatComposer({
  input,
  attachments,
  onInputChange,
  onAddImages,
  onAttachAudio,
  onRemoveAttachment,
  onSend,
  onContextDetail,
  inputDisabledReason,
  canSend,
  contextUsage,
}: ChatComposerProps) {
  const { t } = useTranslation()
  const canInput = inputDisabledReason === null
  const disabledMessage =
    inputDisabledReason === null
      ? null
      : t(`chat.disabledPlaceholder.${inputDisabledReason}`)
  const placeholder = disabledMessage ?? t("chat.placeholder")

  // --- Audio recording state ---
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  // Stop everything on unmount so a half-finished recording doesn't keep
  // holding the microphone or the auto-stop timer.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop()
        } catch {
          /* ignore */
        }
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
      }
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [])

  async function startRecording() {
    if (!canInput || isRecording) return
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(t("chat.audioUnsupported"))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickAudioMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        })
        chunksRef.current = []
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) track.stop()
          streamRef.current = null
        }
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        setIsRecording(false)
        setRecordingSeconds(0)
        setActiveStream(null)
        if (blob.size === 0) return
        try {
          const dataUrl = await blobToDataUrl(blob)
          onAttachAudio({
            type: "audio",
            url: dataUrl,
            filename: `recording-${Date.now()}.webm`,
            contentType: blob.type,
          })
        } catch {
          toast.error(t("chat.audioReadFailed"))
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
      setRecordingSeconds(0)
      setActiveStream(stream)
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1
          if (next >= MAX_AUDIO_RECORDING_SECONDS) {
            stopRecording()
          }
          return next
        })
      }, 1000)
    } catch {
      toast.error(t("chat.microphoneDenied"))
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="before:bg-background pointer-events-none relative z-10 -mt-[24px] shrink-0 [scrollbar-gutter:stable] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:top-[24px] before:bottom-0 before:content-[''] md:px-8 md:pb-8 lg:px-24 xl:px-48">
      <div className="bg-card border-border/60 pointer-events-auto relative mx-auto flex max-w-[1000px] flex-col rounded-2xl border p-3 shadow-sm">
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 px-2">
            {attachments.map((attachment, index) =>
              attachment.type === "audio" ? (
                <div
                  key={`${attachment.url}-${index}`}
                  className="bg-background relative flex items-center gap-2 rounded-xl border px-3 py-2"
                >
                  <audio controls src={attachment.url} className="h-8" />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(index)}
                    className="bg-background/85 text-foreground inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition hover:bg-white"
                    aria-label={t("chat.removeAudio")}
                    title={t("chat.removeAudio")}
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  key={`${attachment.url}-${index}`}
                  className="bg-background relative h-20 w-20 overflow-hidden rounded-xl border"
                >
                  <img
                    src={attachment.url}
                    alt={attachment.filename || t("chat.uploadedImage")}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(index)}
                    className="bg-background/85 text-foreground absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition hover:bg-white"
                    aria-label={t("chat.removeImage")}
                    title={t("chat.removeImage")}
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        {isRecording ? (
          <div className="flex min-h-[64px] items-center gap-3 px-2 py-1">
            <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-red-700 uppercase dark:text-red-300">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t("chat.recording")}
            </span>
            <RecordingWaveform stream={activeStream} />
            <span className="text-foreground/80 text-sm font-medium tabular-nums">
              {Math.floor(recordingSeconds / 60)
                .toString()
                .padStart(2, "0")}
              :{(recordingSeconds % 60).toString().padStart(2, "0")}
            </span>
          </div>
        ) : (
          <TextareaAutosize
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={!canInput}
            title={disabledMessage || undefined}
            className={cn(
              "placeholder:text-muted-foreground/50 max-h-[200px] min-h-[64px] resize-none border-0 bg-transparent px-2 py-1 text-[15px] shadow-none transition-colors focus-visible:ring-0 focus-visible:outline-none dark:bg-transparent",
              !canInput && "cursor-not-allowed",
            )}
            minRows={1}
            maxRows={8}
          />
        )}

        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-full"
              onClick={onAddImages}
              disabled={!canInput || isRecording}
              aria-label={t("chat.attachImage")}
              title={t("chat.attachImage")}
            >
              <IconPhotoPlus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full",
                isRecording
                  ? "bg-red-600 text-white shadow-[0_0_0_4px_rgba(220,38,38,0.16)] hover:bg-red-700"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!canInput}
              aria-label={
                isRecording ? t("chat.stopRecording") : t("chat.recordAudio")
              }
              title={
                isRecording ? t("chat.stopRecording") : t("chat.recordAudio")
              }
            >
              {isRecording ? (
                <IconPlayerStopFilled className="size-4" />
              ) : (
                <IconMicrophone className="size-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {contextUsage && (
              <ContextUsageRing
                usage={contextUsage}
                onDetailClick={onContextDetail}
              />
            )}
            {canInput ? (
              <Tooltip delayDuration={700}>
                <TooltipTrigger asChild>
                  <span tabIndex={!canSend ? 0 : undefined}>
                    <Button
                      type="button"
                      size="icon"
                      className="size-8 rounded-full bg-violet-500 text-white transition-transform hover:bg-violet-600 active:scale-95"
                      onClick={onSend}
                      disabled={!canSend}
                      aria-label={t("chat.sendMessage")}
                    >
                      <IconArrowUp className="size-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  className="border-border/70 bg-muted text-foreground border text-center whitespace-pre-line shadow-lg shadow-black/10 dark:shadow-black/30"
                  arrowClassName="bg-muted fill-muted"
                >
                  {t("chat.sendHint")}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
