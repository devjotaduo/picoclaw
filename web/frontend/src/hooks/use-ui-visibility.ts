import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { LauncherPolicyResponse } from "@/api/launcher-policy"
import {
  DEFAULT_UI_VISIBILITY_POLICY,
  type UIVisibilityProfile,
  UI_VISIBILITY_OVERRIDE_STORAGE_KEY,
  getLocalUIVisibilityPolicy,
  getUIVisibilityProfileOverride,
  isUIElementVisible,
  resolveUIVisibilityProfile,
  setUIVisibilityProfileOverride,
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

  // Subscribe to the storage event so the selector flipping the override
  // re-resolves the profile across all consumers (sidebar, header, chat).
  // The setter dispatches a synthetic StorageEvent in the same tab too.
  const [override, setOverride] = useState<UIVisibilityProfile | null>(() =>
    getUIVisibilityProfileOverride(),
  )
  useEffect(() => {
    if (typeof window === "undefined") return
    const handler = (event: StorageEvent) => {
      if (event.key && event.key !== UI_VISIBILITY_OVERRIDE_STORAGE_KEY) return
      setOverride(getUIVisibilityProfileOverride())
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  const policy = query.data ?? DEFAULT_UI_VISIBILITY_POLICY
  const profile = useMemo(
    () => resolveUIVisibilityProfile(policy, launcherPolicy),
    // override is in deps via the storage subscriber — recomputes when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [launcherPolicy, policy, override],
  )
  const visible = useCallback(
    (element: string, fallback?: boolean) =>
      isUIElementVisible(policy, profile, element, fallback),
    [policy, profile],
  )

  const setProfileOverride = useCallback((next: UIVisibilityProfile | null) => {
    setUIVisibilityProfileOverride(next)
  }, [])

  return {
    policy,
    profile,
    override,
    setProfileOverride,
    visible,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
