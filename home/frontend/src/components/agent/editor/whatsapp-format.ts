const NON_DIGIT = /\D+/g

export function jidToPhone(jid: string): string {
  const trimmed = jid.trim()
  if (!trimmed) return ""
  const beforeAt = trimmed.split("@")[0] ?? trimmed
  const digits = beforeAt.replace(NON_DIGIT, "")
  return digits
}

export function phoneToJID(phone: string): string {
  const digits = phone.replace(NON_DIGIT, "")
  if (!digits) return ""
  return `${digits}@s.whatsapp.net`
}

export function formatPhoneBR(input: string): string {
  const digits = input.replace(NON_DIGIT, "").slice(0, 13)
  if (digits.length === 0) return ""
  if (!digits.startsWith("55")) {
    return formatGeneric(digits)
  }
  const cc = digits.slice(0, 2)
  const area = digits.slice(2, 4)
  const part1 = digits.slice(4, 9)
  const part2 = digits.slice(9, 13)
  let out = `+${cc}`
  if (area) out += ` (${area}`
  if (area.length === 2) out += ")"
  if (part1) out += ` ${part1}`
  if (part2) out += `-${part2}`
  return out
}

function formatGeneric(digits: string): string {
  const groups = digits.match(/.{1,3}/g) ?? [digits]
  return `+${groups.join(" ")}`
}

export function isValidPhone(input: string): boolean {
  const digits = input.replace(NON_DIGIT, "")
  return digits.length >= 10 && digits.length <= 15
}

export function groupJIDToHandle(jid: string): string {
  const trimmed = jid.trim().replace(/^group:/, "")
  const beforeAt = trimmed.split("@")[0] ?? trimmed
  return beforeAt
}

export function handleToGroupJID(handle: string): string {
  const cleaned =
    handle
      .trim()
      .replace(/^group:/, "")
      .split("@")[0] ?? ""
  if (!cleaned) return ""
  return `${cleaned}@g.us`
}

export function shortGroupLabel(jid: string): string {
  const handle = groupJIDToHandle(jid)
  if (!handle) return "Grupo"
  const tail = handle.slice(-6)
  return `Grupo ···${tail}`
}
