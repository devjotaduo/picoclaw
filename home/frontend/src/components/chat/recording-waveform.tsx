import { useEffect, useRef } from "react"

interface RecordingWaveformProps {
  stream: MediaStream | null
  barCount?: number
  className?: string
}

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext }

export function RecordingWaveform({
  stream,
  barCount = 28,
  className,
}: RecordingWaveformProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([])
  const rafRef = useRef<number | null>(null)
  const levelsRef = useRef<number[]>(new Array(barCount).fill(0))

  useEffect(() => {
    if (!stream) return undefined
    const w = window as WebkitWindow
    const AudioCtxCtor = w.AudioContext ?? w.webkitAudioContext
    if (!AudioCtxCtor) return undefined

    const ctx = new AudioCtxCtor()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)

    const buf = new Uint8Array(analyser.frequencyBinCount)
    const step = Math.max(1, Math.floor((buf.length * 0.7) / barCount))

    const tick = () => {
      analyser.getByteFrequencyData(buf)
      for (let i = 0; i < barCount; i++) {
        const raw = (buf[i * step] ?? 0) / 255
        const eased = Math.pow(raw, 0.7)
        levelsRef.current[i] = levelsRef.current[i] * 0.55 + eased * 0.45
        const bar = barsRef.current[i]
        if (bar) {
          const h = 8 + levelsRef.current[i] * 92
          bar.style.transform = `scaleY(${(h / 100).toFixed(3)})`
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      try {
        analyser.disconnect()
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => undefined)
    }
  }, [stream, barCount])

  return (
    <div
      className={
        "flex h-10 flex-1 items-center justify-center gap-[3px] " +
        (className ?? "")
      }
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className="block h-full w-[3px] origin-center rounded-full bg-gradient-to-t from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_8px_rgba(168,85,247,0.4)] will-change-transform"
          style={{
            transform: "scaleY(0.08)",
            transition: "transform 70ms ease-out",
          }}
        />
      ))}
    </div>
  )
}
