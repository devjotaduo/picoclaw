/**
 * useAttendantProposals — reactive hook for the owner's approval queue.
 *
 * Mirrors useNotifications: 15s polling via React Query, graceful empty-on-error
 * so a missing backend never breaks the UI. approve/reject are mutations that
 * invalidate both the proposals list and the notifications list (the staged
 * proposal also created an approval notification).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import {
  type AttendantProposal,
  type AttendantProposalListResponse,
  approveAttendantProposal,
  listAttendantProposals,
  rejectAttendantProposal,
} from "@/api/attendant-proposals"

const QUERY_KEY = ["attendant-proposals", "list"] as const
const NOTIFICATIONS_KEY = ["notifications", "list"] as const
const POLL_INTERVAL_MS = 15_000

const EMPTY_RESPONSE: AttendantProposalListResponse = { proposals: [] }

export function useAttendantProposals(opts: { pendingOnly?: boolean } = {}) {
  const queryClient = useQueryClient()
  const pendingOnly = opts.pendingOnly ?? true

  const query = useQuery<AttendantProposalListResponse>({
    queryKey: pendingOnly ? [...QUERY_KEY, "pending"] : QUERY_KEY,
    queryFn: async () => {
      try {
        return await listAttendantProposals({ pendingOnly })
      } catch (err) {
        console.warn(
          "[attendant-proposals] fetch falhou, retornando vazio:",
          err,
        )
        return EMPTY_RESPONSE
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS / 2,
    retry: false,
  })

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  }, [queryClient])

  const approve = useMutation({
    mutationFn: (id: string) => approveAttendantProposal(id),
    onSettled: invalidate,
  })

  const reject = useMutation({
    mutationFn: (id: string) => rejectAttendantProposal(id),
    onSettled: invalidate,
  })

  const handleApprove = useCallback(
    (p: AttendantProposal) => approve.mutateAsync(p.id),
    [approve],
  )
  const handleReject = useCallback(
    (p: AttendantProposal) => reject.mutateAsync(p.id),
    [reject],
  )

  const data = query.data ?? EMPTY_RESPONSE

  return {
    proposals: data.proposals,
    pendingCount: data.proposals.filter((p) => p.status === "pending").length,
    isLoading: query.isLoading,
    isError: query.isError,
    approve: handleApprove,
    reject: handleReject,
    isApproving: approve.isPending,
    isRejecting: reject.isPending,
    approveError: approve.error instanceof Error ? approve.error.message : null,
    decidingId:
      (approve.isPending && approve.variables) ||
      (reject.isPending && reject.variables) ||
      null,
    refetch: query.refetch,
  }
}
