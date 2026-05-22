import { useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import type { LauncherPolicyResponse } from "@/api/launcher-policy"
import {
  DEFAULT_UI_VISIBILITY_POLICY,
  getLocalUIVisibilityPolicy,
  isUIElementVisible,
  resolveUIVisibilityProfile,
} from "@/api/ui-visibility"

export function useUIVisibility(
  launcherPolicy?: Pick<LauncherPolicyResponse, "role" | "is_saas_admin">,
) {
  const query = useQuery({
    queryKey: ["ui-visibility-policy", "local-json"],
    queryFn: getLocalUIVisibilityPolicy,
    retry: false,
    staleTime: 10_000,
  })

  const policy = query.data ?? DEFAULT_UI_VISIBILITY_POLICY
  const profile = useMemo(
    () => resolveUIVisibilityProfile(policy, launcherPolicy),
    [launcherPolicy, policy],
  )
  const visible = useCallback(
    (element: string, fallback?: boolean) =>
      isUIElementVisible(policy, profile, element, fallback),
    [policy, profile],
  )

  return {
    policy,
    profile,
    visible,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
