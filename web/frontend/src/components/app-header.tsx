import {
  IconLoader2,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconPlayerPlay,
  IconPower,
  IconRefresh,
  IconSettings,
  IconSun,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { postLauncherDashboardLogout } from "@/api/launcher-auth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator.tsx"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useGateway } from "@/hooks/use-gateway.ts"
import { useTheme } from "@/hooks/use-theme.ts"

export function AppHeader() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const showSidebarToggle = false
  const showConnectionStatus = false
  const showHeaderActions = true
  const {
    state: gwState,
    loading: gwLoading,
    canStart,
    startReason,
    restartRequired,
    start,
    restart,
    stop,
    error: gwError,
  } = useGateway()

  const isRunning = gwState === "running"
  const isStarting = gwState === "starting"
  const isRestarting = gwState === "restarting"
  const isStopping = gwState === "stopping"
  const isStopped = gwState === "stopped" || gwState === "unknown"
  const showNotConnectedHint =
    !isRestarting &&
    !isStopping &&
    canStart &&
    (gwState === "stopped" || gwState === "error")

  const [showStopDialog, setShowStopDialog] = React.useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false)

  const handleLogout = async () => {
    await postLauncherDashboardLogout()
    globalThis.location.assign("/launcher-login")
  }

  const handleGatewayToggle = () => {
    if (gwLoading || isRestarting || isStopping || (!isRunning && !canStart)) {
      return
    }
    if (isRunning) {
      setShowStopDialog(true)
    } else {
      void start()
    }
  }

  const handleGatewayRestart = () => {
    if (gwLoading || isRestarting || !restartRequired || !canStart) return
    void restart()
  }

  const confirmStop = () => {
    setShowStopDialog(false)
    stop()
  }

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 border-b-border/50 sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        {showSidebarToggle && (
          <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:size-5">
            <IconMenu2 />
          </SidebarTrigger>
        )}
        <div className="hidden w-36 shrink-0 items-center sm:flex">
          <Link to="/">
            <img
              className="block w-full dark:hidden"
              src="/logo_with_text_light.png"
              alt="Logo"
            />
            <img
              className="hidden w-full dark:block"
              src="/logo_with_text_dark.png"
              alt="Logo"
            />
          </Link>
        </div>
      </div>

      {/* Center prominent connection status */}
      <div className="pointer-events-none absolute left-1/2 hidden h-full -translate-x-1/2 items-center justify-center lg:flex">
        {showConnectionStatus && showNotConnectedHint && (
          <div className="text-muted-foreground flex items-center gap-2 rounded-full border border-dashed px-4 py-1.5 text-xs shadow-sm backdrop-blur-md">
            <span className="bg-destructive/50 relative flex size-2 shrink-0 items-center justify-center rounded-full">
              <span className="bg-destructive absolute inline-flex size-full animate-ping rounded-full opacity-75"></span>
            </span>
            {t("chat.notConnected")}
          </div>
        )}
      </div>

      <AlertDialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("header.gateway.stopDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.gateway.stopDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStop}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("header.gateway.stopDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.logout.tooltip")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.logout.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleLogout()}>
              {t("header.logout.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className={`text-muted-foreground ${
          showHeaderActions ? "flex" : "hidden"
        } items-center gap-1 text-sm font-medium md:gap-2`}
      >
        {restartRequired && (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon-sm"
                className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/25"
                onClick={handleGatewayRestart}
                disabled={gwLoading || isRestarting || isStopping || !canStart}
                aria-label={t("header.gateway.action.restart")}
              >
                <IconRefresh className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("header.gateway.restartRequired")}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Gateway Start/Stop — quando ativo, fica no menu Configurações */}
        {isRunning ? (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <span
                role="status"
                aria-label={t("header.gateway.status.running", "Conectado")}
                className="text-muted-foreground/70 hidden items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 sm:inline-flex"
                data-tour="gateway-button"
              >
                <span className="size-1.5 rounded-full bg-emerald-500/60" />
                {t("header.gateway.status.running", "Conectado")}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {gwError ??
                t("header.gateway.action.running", "Serviço conectado")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip
            delayDuration={gwError || (!canStart && startReason) ? 0 : 700}
          >
            <TooltipTrigger asChild>
              {/* Wrap in span so the tooltip still fires when the button is disabled */}
              <span
                className={
                  !canStart && startReason ? "cursor-not-allowed" : undefined
                }
                tabIndex={!canStart && startReason ? 0 : undefined}
              >
                <Button
                  variant={
                    isStarting || isRestarting || isStopping
                      ? "secondary"
                      : "default"
                  }
                  size="sm"
                  data-tour="gateway-button"
                  className={`h-8 gap-2 px-3 transition-colors duration-200 ${
                    isStopped
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : ""
                  } ${!canStart ? "pointer-events-none" : ""}`}
                  onClick={handleGatewayToggle}
                  disabled={
                    gwLoading ||
                    isStarting ||
                    isRestarting ||
                    isStopping ||
                    !canStart
                  }
                >
                  {gwLoading || isStarting || isRestarting || isStopping ? (
                    <IconLoader2 className="h-4 w-4 animate-spin opacity-70" />
                  ) : (
                    <IconPlayerPlay className="h-4 w-4 opacity-80" />
                  )}
                  <span className="text-xs font-semibold">
                    {isStopping
                      ? t("header.gateway.status.stopping")
                      : isRestarting
                        ? t("header.gateway.status.restarting")
                        : isStarting
                          ? t("header.gateway.status.starting")
                          : t("header.gateway.action.start")}
                  </span>
                </Button>
              </span>
            </TooltipTrigger>
            {gwError || (!canStart && startReason) ? (
              <TooltipContent>{gwError ?? startReason}</TooltipContent>
            ) : null}
          </Tooltip>
        )}

        <Separator
          className="mx-4 my-2 hidden md:block"
          orientation="vertical"
        />

        {/* Settings menu (theme + dangerous gateway controls) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("header.settings.tooltip", "Configurações")}
            >
              <IconSettings className="size-4.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
              {t("header.settings.appearance", "Aparência")}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === "dark" ? (
                <IconSun className="size-3.5" />
              ) : (
                <IconMoon className="size-3.5" />
              )}
              {theme === "dark"
                ? t("header.theme.light", "Modo claro")
                : t("header.theme.dark", "Modo escuro")}
            </DropdownMenuItem>
            {isRunning && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
                  {t("header.settings.gateway", "Gateway")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={handleGatewayToggle}
                  disabled={gwLoading}
                  className="text-red-700 focus:bg-red-500/10 focus:text-red-700 dark:text-red-300 dark:focus:bg-red-500/20"
                >
                  <IconPower className="size-3.5" />
                  {t("header.gateway.action.stop", "Parar gateway")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator className="mx-2 my-2" orientation="vertical" />

        {/* Logout */}
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setShowLogoutDialog(true)}
              aria-label={t("header.logout.tooltip")}
            >
              <IconLogout className="size-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("header.logout.tooltip")}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
