/**
 * SidebarUserFooter — rodapé da sidebar com avatar (iniciais) + workspace +
 * papel, espelhando o rodapé do Claude Code ("Jota · Max"). Workspace vem do
 * agent-dashboard; o papel vem da launcher policy. Some no modo icon.
 */
import { useQuery } from "@tanstack/react-query"

import { getLauncherPolicy } from "@/api/launcher-policy"
import { agentInitials } from "@/components/right-rail/rail-utils"
import { useAgentDashboard } from "@/hooks/use-agent-dashboard"

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "Proprietário",
  tenant_admin: "Administrador",
  platform_admin: "Plataforma",
  operator: "Operador",
  viewer: "Visualização",
}

function prettyWorkspace(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim()
  if (!cleaned || cleaned === "workspace") return "Workspace"
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SidebarUserFooter() {
  const { workspace } = useAgentDashboard()
  const { data: policy } = useQuery({
    queryKey: ["launcher-policy", "footer"],
    queryFn: getLauncherPolicy,
    retry: false,
    staleTime: 60_000,
  })

  const name = prettyWorkspace(workspace)
  const roleLabel = policy?.role ? (ROLE_LABEL[policy.role] ?? policy.role) : ""

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:hidden">
      <span className="bg-primary/10 text-primary ring-primary/15 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1">
        {agentInitials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-[13px] leading-tight font-medium">
          {name}
        </span>
        {roleLabel ? (
          <span className="text-muted-foreground/60 block truncate text-[11px] leading-tight">
            {roleLabel}
          </span>
        ) : null}
      </span>
    </div>
  )
}
