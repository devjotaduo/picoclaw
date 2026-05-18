const AVATAR_PALETTES = [
  { bg: "#2563eb", fg: "#fff" },
  { bg: "#16a34a", fg: "#fff" },
  { bg: "#dc2626", fg: "#fff" },
  { bg: "#d97706", fg: "#fff" },
  { bg: "#7c3aed", fg: "#fff" },
  { bg: "#0891b2", fg: "#fff" },
  { bg: "#be185d", fg: "#fff" },
  { bg: "#065f46", fg: "#fff" },
  { bg: "#b45309", fg: "#fff" },
  { bg: "#4338ca", fg: "#fff" },
] as const

export interface AvatarPalette {
  bg: string
  fg: string
}

export function avatarPalette(name: string): AvatarPalette {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length]!
}

export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "?"
}
