export interface ContrastResult {
  ratio: number
  level: "AAA" | "AA" | "AA-large" | "fail"
  label: string
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(parseHex(foreground))
  const bg = relativeLuminance(parseHex(background))
  if (fg === null || bg === null) return 0
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

export function contrastInfo(
  foreground: string,
  background: string,
): ContrastResult {
  const ratio = contrastRatio(foreground, background)
  const rounded = Math.round(ratio * 10) / 10
  if (ratio >= 7) {
    return { ratio: rounded, level: "AAA", label: `Contraste: ${rounded}:1 · AAA` }
  }
  if (ratio >= 4.5) {
    return { ratio: rounded, level: "AA", label: `Contraste: ${rounded}:1 · AA` }
  }
  if (ratio >= 3) {
    return {
      ratio: rounded,
      level: "AA-large",
      label: `Contraste: ${rounded}:1 · AA somente texto grande`,
    }
  }
  return { ratio: rounded, level: "fail", label: `Contraste: ${rounded}:1 · insuficiente` }
}

function parseHex(value: string): [number, number, number] | null {
  let v = value.trim().replace(/^#/, "")
  if (v.length === 3) {
    v = v
      .split("")
      .map((c) => c + c)
      .join("")
  }
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  return [r, g, b]
}

function relativeLuminance(rgb: [number, number, number] | null): number | null {
  if (!rgb) return null
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
