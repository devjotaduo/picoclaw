import { avatarPalette, nameInitials } from "@/lib/whatsapp/avatar-palette"

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
      className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white/80 select-none dark:ring-black/30 ${className}`}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      aria-hidden="true"
    >
      {nameInitials(name)}
    </div>
  )
}
