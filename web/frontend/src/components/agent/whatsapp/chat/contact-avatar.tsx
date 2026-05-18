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

export function avatarPalette(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length]!
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "?"
}

export interface ContactAvatarProps {
  name: string
  url?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

export function ContactAvatar({
  name,
  url,
  size = "md",
  className = "",
}: ContactAvatarProps) {
  const sizeClass = { sm: "size-9", md: "size-11", lg: "size-14" }[size]
  const textClass = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size]
  const palette = avatarPalette(name)

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-white/80 dark:ring-black/30 ${className}`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-full font-semibold select-none ring-2 ring-white/80 dark:ring-black/30 ${className}`}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      aria-hidden="true"
    >
      {nameInitials(name)}
    </div>
  )
}
