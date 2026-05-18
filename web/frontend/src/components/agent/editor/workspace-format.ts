export function workspaceFriendlyName(
  workspace: string,
  isDefault?: boolean,
): string {
  if (!workspace) return isDefault ? "Principal" : "Personalizado"
  if (isDefault) return "Principal"
  const segments = workspace.replace(/\\/g, "/").split("/").filter(Boolean)
  const last = segments[segments.length - 1] ?? ""
  if (!last) return "Principal"
  if (last === "workspace") return "Principal"
  const cleaned = last.replace(/^workspace-/, "")
  return cleaned ? capitalize(cleaned) : "Principal"
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
