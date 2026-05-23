import {
  IconBrandOpenai,
  IconClockHour4,
  IconKey,
  IconLoader2,
  IconPlayerStopFilled,
  IconTerminal2,
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

interface OpenAICredentialCardProps {
  status?: OAuthProviderStatus
  activeAction: string
  token: string
  onTokenChange: (value: string) => void
  onStartBrowserOAuth: () => void
  onStartDeviceCode: () => void
  onImportCodexCLI: () => void
  onStopLoading: () => void
  onSaveToken: () => void
  onAskLogout: () => void
}

export function OpenAICredentialCard({
  status,
  activeAction,
  token,
  onTokenChange,
  onStartBrowserOAuth,
  onStartDeviceCode,
  onImportCodexCLI,
  onStopLoading,
  onSaveToken,
  onAskLogout,
}: OpenAICredentialCardProps) {
  const { t } = useTranslation()
  const actionBusy = activeAction !== ""
  const browserLoading = activeAction === "openai:browser"
  const deviceLoading = activeAction === "openai:device"
  const oauthLoading = browserLoading || deviceLoading
  const tokenLoading = activeAction === "openai:token"
  const codexLoading = activeAction === "openai:codex_cli"

  return (
    <CredentialCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="border-muted inline-flex size-6 items-center justify-center rounded-full border">
            <IconBrandOpenai className="size-3.5" />
          </span>
          <span>OpenAI</span>
        </span>
      }
      description={t("credentials.providers.openai.description")}
      status={status?.status ?? "not_logged_in"}
      authMethod={status?.auth_method}
      details={<CredentialStatusDetails status={status} />}
      actions={
        <div className="border-muted flex h-[120px] flex-col rounded-lg border p-3">
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-8">
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={onStartBrowserOAuth}
                >
                  {browserLoading && (
                    <IconLoader2 className="size-4 animate-spin" />
                  )}
                  <IconBrandOpenai className="size-4" />
                  {t("credentials.actions.browser")}
                </Button>

                {oauthLoading && !deviceLoading && (
                  <Button
                    size="icon-xs"
                    variant="secondary"
                    onClick={onStopLoading}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <IconPlayerStopFilled className="size-4" />
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={onStartDeviceCode}
                >
                  {deviceLoading && (
                    <IconLoader2 className="size-4 animate-spin" />
                  )}
                  <IconClockHour4 className="size-4" />
                  {t("credentials.actions.deviceCode")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={onImportCodexCLI}
                >
                  {codexLoading && (
                    <IconLoader2 className="size-4 animate-spin" />
                  )}
                  <IconTerminal2 className="size-4" />
                  {t("credentials.actions.importCodexCLI")}
                </Button>
              </div>
            </div>

            <div className="min-h-9 flex-1">
              <div className="flex h-full items-center gap-2">
                <Input
                  value={token}
                  onChange={(e) => onTokenChange(e.target.value)}
                  type="password"
                  placeholder={tokenPlaceholder(
                    status,
                    t("credentials.fields.openaiToken"),
                  )}
                />
                <Button
                  size="sm"
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
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <IconPlayerStopFilled className="size-4" />
                  </Button>
                )}
              </div>
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
            {activeAction === "openai:logout" && (
              <IconLoader2 className="size-4 animate-spin" />
            )}
            {t("credentials.actions.logout")}
          </Button>
        ) : null
      }
    />
  )
}
