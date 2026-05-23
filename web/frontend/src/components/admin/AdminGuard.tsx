import * as React from "react"

interface AdminGuardProps {
  children: React.ReactNode
}

/**
 * Kept as a route wrapper for compatibility with existing pages.
 * Visibility and access are now handled by the sidebar/profile config and by
 * the backend APIs themselves, so this component no longer blocks rendering.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  return <>{children}</>
}
