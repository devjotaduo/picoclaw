/**
 * useAgentDashboard — hook reativo para o painel dos agentes.
 *
 * Espelha o padrão de use-notifications: react-query com polling (30s) e
 * degradação graciosa (retorna resposta vazia se o backend ainda não estiver
 * montado, em vez de quebrar o right rail). O sidebar legado faz o mesmo fetch
 * via setInterval; este hook centraliza para o right rail e qualquer consumidor
 * futuro reaproveitar o cache do react-query.
 */
import { useQuery } from "@tanstack/react-query"

import {
  type AgentDashboardResponse,
  getAgentDashboard,
} from "@/api/agent-dashboard"
import { normalizeAgentDashboardResponse } from "@/lib/agent-dashboard"

const QUERY_KEY = ["agent-dashboard", "list"] as const
const POLL_INTERVAL_MS = 30_000

const EMPTY_RESPONSE: AgentDashboardResponse = normalizeAgentDashboardResponse(
  undefined,
)

export function useAgentDashboard() {
  const query = useQuery<AgentDashboardResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      try {
        return await getAgentDashboard()
      } catch (err) {
        console.warn("[agent-dashboard] fetch falhou, retornando vazio:", err)
        return EMPTY_RESPONSE
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS / 2,
    retry: false,
  })

  const data = query.data ?? EMPTY_RESPONSE

  return {
    ...data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
