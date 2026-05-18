import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error"

export interface AudioClip {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface UseAudioRecorderResult {
  state: RecorderState
  /** Current elapsed recording time in ms (updates ~10 times per second). */
  elapsedMs: number
  /** Last frequency snapshot for waveform painting, values 0..255. */
  waveform: Uint8Array | null
  errorMessage: string | null
  start: () => Promise<void>
  /** Stop and resolve with the recorded clip (`null` if nothing captured). */
  stop: () => Promise<AudioClip | null>
  cancel: () => void
}

/**
 * Lean wrapper around MediaRecorder + AudioContext. Owns:
 *   - microphone permission request
 *   - timer for the elapsed counter
 *   - analyser tap for waveform rendering
 * The caller (the AudioRecorder component) handles the UI and sending.
 */
export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [waveform, setWaveform] = useState<Uint8Array | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTsRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const stopResolverRef = useRef<((clip: AudioClip | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const start = useCallback(async () => {
    if (state === "recording" || state === "requesting") return
    setErrorMessage(null)
    setState("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick the best supported MIME — webm is the default in Chromium; Safari
      // prefers mp4/m4a. MediaRecorder.isTypeSupported reports compatibility.
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ]
      const mimeType =
        preferred.find((m) => MediaRecorder.isTypeSupported(m)) ?? ""

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.addEventListener("dataavailable", (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      })
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        const clip: AudioClip = {
          blob,
          mimeType: recorder.mimeType || "audio/webm",
          durationMs: Date.now() - startTsRef.current,
        }
        const resolver = stopResolverRef.current
        stopResolverRef.current = null
        cleanup()
        setState("stopped")
        if (resolver) resolver(blob.size > 0 ? clip : null)
      })

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser

      startTsRef.current = Date.now()
      recorder.start(250)
      setState("recording")
      setElapsedMs(0)

      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTsRef.current)
      }, 100)

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(buffer)
        setWaveform(buffer.slice())
        rafRef.current = window.requestAnimationFrame(tick)
      }
      rafRef.current = window.requestAnimationFrame(tick)
    } catch (err) {
      cleanup()
      setState("error")
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }, [cleanup, state])

  const stop = useCallback((): Promise<AudioClip | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== "recording") {
      cleanup()
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      stopResolverRef.current = resolve
      try {
        recorder.stop()
      } catch {
        resolve(null)
      }
    })
  }, [cleanup])

  const cancel = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop()
      } catch {
        /* swallow */
      }
    }
    stopResolverRef.current = null
    cleanup()
    setState("idle")
    setElapsedMs(0)
    setWaveform(null)
  }, [cleanup])

  return { state, elapsedMs, waveform, errorMessage, start, stop, cancel }
}
