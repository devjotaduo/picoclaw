import * as React from "react"
import { useTranslation } from "react-i18next"

import type { OAuthProviderStatus } from "@/api/oauth"

interface CredentialStatusDetailsProps {
  status?: OAuthProviderStatus
}

export function tokenPlaceholder(
  status: OAuthProviderStatus | undefined,
  fallback: string,
) {
  return status?.token_preview || fallback
}

export function CredentialStatusDetails({
  status,
}: CredentialStatusDetailsProps) {
  const { t } = useTranslation()
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!status?.expires_at) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [status?.expires_at])

  const identity =
    status?.account_id || status?.email || status?.project_id || undefined
  const expiresIn = formatExpiresIn(status?.expires_at)

  if (!status?.logged_in && !identity && !expiresIn) {
    return null
  }

  return (
    <div className="space-y-1">
      {identity && (
        <p>
          {t("credentials.labels.identifier")}: {identity}
        </p>
      )}
      {status?.project_id && status.project_id !== identity && (
        <p>
          {t("credentials.labels.project")}: {status.project_id}
        </p>
      )}
      {status?.token_preview && (
        <p>
          {t("credentials.labels.token")}: {status.token_preview}
        </p>
      )}
      {expiresIn && (
        <p>
          {t("credentials.labels.expires")}: {expiresIn}
        </p>
      )}
    </div>
  )
}

function formatExpiresIn(expiresAt: string | undefined) {
  if (!expiresAt) return ""
  const expires = new Date(expiresAt).getTime()
  if (!Number.isFinite(expires)) return ""
  const diffMs = expires - Date.now()
  if (diffMs <= 0) return "expirado"
  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
