import { AgentAudioVisualizerAura } from "@/components/agent-audio-visualizer-aura"
import { cn } from "@/lib/utils"

export type AuraColor = `#${string}`
export type AuraPalette = readonly [AuraColor, AuraColor, AuraColor, AuraColor]

const agentAuraPalettes = [
  ["#14B8A6", "#38BDF8", "#8B5CF6", "#F97316"],
  ["#22C55E", "#A3E635", "#06B6D4", "#F59E0B"],
  ["#0EA5E9", "#6366F1", "#F43F5E", "#FACC15"],
  ["#10B981", "#84CC16", "#F97316", "#EC4899"],
  ["#06B6D4", "#3B82F6", "#A855F7", "#F43F5E"],
  ["#F97316", "#F59E0B", "#14B8A6", "#0EA5E9"],
  ["#14B8A6", "#22C55E", "#EAB308", "#EC4899"],
  ["#38BDF8", "#0EA5E9", "#8B5CF6", "#F43F5E"],
] as const satisfies readonly AuraPalette[]

interface AIOrbAvatarProps {
  className?: string
  seed?: string
  colors?: AuraPalette
}

function hashSeed(seed: string) {
  return Array.from(seed || "agent").reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    7,
  )
}

function paletteForSeed(seed: string): AuraPalette {
  const normalized = seed.toLowerCase()

  if (normalized.includes("main") || normalized.includes("atendente")) {
    return agentAuraPalettes[0]!
  }
  if (normalized.includes("vendas") || normalized.includes("sales")) {
    return agentAuraPalettes[1]!
  }
  if (normalized.includes("marketing")) {
    return agentAuraPalettes[2]!
  }
  if (normalized.includes("assistente") || normalized.includes("sofia")) {
    return agentAuraPalettes[3]!
  }
  if (normalized.includes("rafael")) {
    return agentAuraPalettes[4]!
  }
  if (normalized.includes("analise") || normalized.includes("analytics")) {
    return agentAuraPalettes[5]!
  }

  return agentAuraPalettes[hashSeed(seed) % agentAuraPalettes.length]!
}

function paletteBackground([
  primary,
  secondary,
  tertiary,
  quaternary,
]: AuraPalette) {
  return `radial-gradient(circle at 32% 24%, ${secondary} 0%, ${primary} 38%, ${tertiary} 70%, ${quaternary} 100%)`
}

export function AIOrbAvatar({
  className,
  seed = "sofia",
  colors,
}: AIOrbAvatarProps) {
  const palette = colors ?? paletteForSeed(seed)
  const [primary, secondary, tertiary, quaternary] = palette

  return (
    <div
      className={cn(
        "relative isolate size-full overflow-hidden rounded-full",
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: paletteBackground(palette),
        }}
      />
      <AgentAudioVisualizerAura
        state="idle"
        size="md"
        color={primary}
        secondaryColor={secondary}
        tertiaryColor={tertiary}
        quaternaryColor={quaternary}
        colorShift={0}
        themeMode="dark"
        className="!size-full scale-[2.2] opacity-100"
      />
      <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-cyan-300/25 ring-inset" />
    </div>
  )
}
