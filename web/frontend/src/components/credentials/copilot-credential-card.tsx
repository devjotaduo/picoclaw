import {
  IconBrandGithub,
  IconKey,
  IconLoader2,
  IconPlayerStopFilled,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

import type { OAuthProviderStatus } from "@/api/oauth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { CredentialCard } from "./credential-card"
import {
  CredentialStatusDetails,
  tokenPlaceholder,
} from "./credential-status-details"

interface CopilotCredentialCardProps {
  status?: OAuthProviderStatus
  activeAction: string
  token: string
  onTokenChange: (value: string) => void
  onStopLoading: () => void
  onSaveToken: () => void
  onAskLogout: () => void
  onImportGHCLI: () => void
}

export function CopilotCredentialCard({
  status,
  activeAction,
  token,
  onTokenChange,
  onStopLoading,
  onSaveToken,
  onAskLogout,
  onImportGHCLI,
}: CopilotCredentialCardProps) {
  const { t } = useTranslation()
  const actionBusy = activeAction !== ""
  const tokenLoading = activeAction === "github-copilot:token"
  const stopLabel = t("credentials.actions.stopLoading")

  return (
    <CredentialCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="border-muted inline-flex size-6 items-center justify-center rounded-full border">
            <IconBrandGithub className="size-3.5" />
          </span>
          <span>GitHub Copilot</span>
        </span>
      }
      description={t("credentials.providers.copilot.description")}
      status={status?.status ?? "not_logged_in"}
      authMethod={status?.auth_method}
      details={<CredentialStatusDetails status={status} />}
      actions={
        <div className="border-muted flex flex-col rounded-lg border p-3">
          <div className="flex flex-col gap-3">
            <div className="min-h-8">
              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy}
                onClick={onImportGHCLI}
              >
                {activeAction === "github-copilot:gh_cli" && (
                  <IconLoader2 className="size-4 animate-spin" />
                )}
                <IconBrandGithub className="size-4" />
                {t("credentials.actions.importGHCLI")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={token}
                onChange={(e) => onTokenChange(e.target.value)}
                type="password"
                placeholder={tokenPlaceholder(
                  status,
                  t("credentials.fields.githubToken"),
                )}
              />
              <Button
                size="sm"
                className="w-fit"
                disabled={actionBusy || !token.trim()}
                onClick={onSaveToken}
              >
                {tokenLoading && (
                  <IconLoader2 className="size-4 animate-spin" />
                )}
                <IconKey className="size-4" />
                {t("credentials.actions.saveToken")}
              </Button>
              {tokenLoading && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={onStopLoading}
                  aria-label={stopLabel}
                  title={stopLabel}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <IconPlayerStopFilled className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      }
      footer={
        status?.logged_in ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={actionBusy}
            onClick={onAskLogout}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {activeAction === "github-copilot:logout" && (
              <IconLoader2 className="size-4 animate-spin" />
            )}
            {t("credentials.actions.logout")}
          </Button>
        ) : null
      }
    />
  )
}
