import {
  IconBrandWhatsapp,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type WhatsAppNativeQRResponse,
  type WhatsAppNativeQRStatus,
  getWhatsAppNativeQR,
} from "@/api/channels"
import { restartGateway } from "@/api/gateway"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useGateway } from "@/hooks/use-gateway"
import { refreshGatewayState } from "@/store/gateway"

const POLL_INTERVAL_MS = 2000

const WA_GREEN = "#25D366"
const WA_GREEN_DEEP = "#128C7E"

type PairingStatus = WhatsAppNativeQRStatus

interface WhatsAppNativeFormProps {
  enabled: boolean
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 4) return raw
  const tail = digits.slice(-4)
  const head = digits.slice(0, Math.max(0, digits.length - 6))
  return `+${head} ●●●● ${tail}`
}

export function WhatsAppNativeForm({ enabled }: WhatsAppNativeFormProps) {
  const { t } = useTranslation()
  const { state: gatewayState } = useGateway()

  const [snapshot, setSnapshot] = useState<WhatsAppNativeQRResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const pollGenRef = useRef(0)
  const autoRefreshedRef = useRef(false)
  const restartInFlightRef = useRef(false)

  const triggerRestart = useCallback(
    async (silent: boolean) => {
      if (restartInFlightRef.current) return
      restartInFlightRef.current = true
      if (!silent) setRefreshing(true)
      setRefreshError("")
      setSnapshot({ status: "idle" })
      setLoading(true)
      try {
        await restartGateway()
        await refreshGatewayState({ force: true })
      } catch (e) {
        if (!silent) {
          setRefreshError(
            e instanceof Error
              ? e.message
              : t("channels.whatsappNative.refreshError"),
          )
        }
      } finally {
        restartInFlightRef.current = false
        if (!silent) setRefreshing(false)
      }
    },
    [t],
  )

  const fetchSnapshot = useCallback(async () => {
    const gen = pollGenRef.current
    try {
      const resp = await getWhatsAppNativeQR()
      if (gen !== pollGenRef.current) return
      if (resp.status === "expired" && !autoRefreshedRef.current) {
        autoRefreshedRef.current = true
        setSnapshot({ status: "idle" })
        void triggerRestart(true)
        return
      }
      if (resp.status === "wait" || resp.status === "confirmed") {
        autoRefreshedRef.current = true
      }
      setSnapshot(resp)
    } catch {
      if (gen !== pollGenRef.current) return
      setSnapshot({
        status: "offline",
        error: t("channels.whatsappNative.errorOffline"),
      })
    } finally {
      if (gen === pollGenRef.current) setLoading(false)
    }
  }, [t, triggerRestart])

  useEffect(() => {
    pollGenRef.current += 1
    autoRefreshedRef.current = false
    setLoading(true)

    if (!enabled) {
      setSnapshot({ status: "disabled" })
      setLoading(false)
      return
    }
    if (gatewayState !== "running") {
      setSnapshot({ status: "offline" })
      setLoading(false)
      return
    }

    void fetchSnapshot()
    const interval = window.setInterval(() => {
      void fetchSnapshot()
    }, POLL_INTERVAL_MS)
    return () => {
      pollGenRef.current += 1
      window.clearInterval(interval)
    }
  }, [enabled, gatewayState, fetchSnapshot])

  const status: PairingStatus = snapshot?.status ?? "idle"
  const qrDataURI = snapshot?.qr_data_uri ?? ""
  const phoneNumber = snapshot?.phone_number ?? ""

  const handleRefresh = useCallback(() => {
    autoRefreshedRef.current = true
    void triggerRestart(false)
  }, [triggerRestart])

  return (
    <Card className="overflow-hidden p-0 shadow-sm">
      <CardHeader className="border-border/60 border-b px-6 py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DEEP} 100%)`,
              boxShadow: "0 6px 18px -8px rgba(37, 211, 102, 0.55)",
            }}
          >
            <IconBrandWhatsapp size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-foreground text-sm font-medium">
              {t("channels.whatsappNative.bindTitle")}
            </CardTitle>
            <CardDescription className="mt-0.5">
              {t("channels.whatsappNative.bindDesc")}
            </CardDescription>
          </div>
          <StatusPill status={status} />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid gap-0 md:grid-cols-[auto_1fr]">
          <PairingStage
            status={status}
            qrDataURI={qrDataURI}
            phoneNumber={phoneNumber}
            loading={loading}
          />
          <Instructions
            status={status}
            errorMessage={snapshot?.error ?? ""}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={handleRefresh}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatusPill({ status }: { status: PairingStatus }) {
  const { t } = useTranslation()

  const styles: Record<
    PairingStatus,
    { label: string; bg: string; text: string; dot: string; pulse: boolean }
  > = {
    idle: {
      label: t("channels.whatsappNative.status.idle"),
      bg: "rgba(120, 120, 120, 0.12)",
      text: "var(--muted-foreground)",
      dot: "currentColor",
      pulse: false,
    },
    wait: {
      label: t("channels.whatsappNative.status.wait"),
      bg: "rgba(37, 211, 102, 0.10)",
      text: WA_GREEN_DEEP,
      dot: WA_GREEN,
      pulse: true,
    },
    scanned: {
      label: t("channels.whatsappNative.status.scanned"),
      bg: "rgba(245, 158, 11, 0.10)",
      text: "rgb(180, 110, 0)",
      dot: "rgb(245, 158, 11)",
      pulse: true,
    },
    confirmed: {
      label: t("channels.whatsappNative.status.confirmed"),
      bg: "rgba(37, 211, 102, 0.12)",
      text: WA_GREEN_DEEP,
      dot: WA_GREEN,
      pulse: false,
    },
    expired: {
      label: t("channels.whatsappNative.status.expired"),
      bg: "rgba(120, 120, 120, 0.12)",
      text: "var(--muted-foreground)",
      dot: "currentColor",
      pulse: false,
    },
    error: {
      label: t("channels.whatsappNative.status.error"),
      bg: "rgba(220, 38, 38, 0.10)",
      text: "rgb(180, 30, 30)",
      dot: "rgb(220, 38, 38)",
      pulse: false,
    },
    offline: {
      label: t("channels.whatsappNative.status.offline"),
      bg: "rgba(120, 120, 120, 0.12)",
      text: "var(--muted-foreground)",
      dot: "currentColor",
      pulse: false,
    },
    disabled: {
      label: t("channels.whatsappNative.status.disabled"),
      bg: "rgba(120, 120, 120, 0.12)",
      text: "var(--muted-foreground)",
      dot: "currentColor",
      pulse: false,
    },
  }

  const s = styles[status]
  return (
    <div
      className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium tracking-wide uppercase"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="relative inline-flex h-2 w-2">
        {s.pulse && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: s.dot,
              animation: "waStatusBreath 1.6s ease-in-out infinite",
            }}
          />
        )}
        <span
          className="relative inline-block h-2 w-2 rounded-full"
          style={{ background: s.dot }}
        />
      </span>
      {s.label}
    </div>
  )
}

interface PairingStageProps {
  status: PairingStatus
  qrDataURI: string
  phoneNumber: string
  loading: boolean
}

function PairingStage({
  status,
  qrDataURI,
  phoneNumber,
  loading,
}: PairingStageProps) {
  const { t } = useTranslation()

  const showQR = status === "wait" && qrDataURI !== ""
  const showSpinner =
    loading || (status === "wait" && qrDataURI === "") || status === "scanned"
  const showConfirmed = status === "confirmed"
  const showExpired = status === "expired"
  const showError = status === "error"
  const showOffline = status === "offline" || status === "disabled"
  const showIdle = status === "idle"

  return (
    <div
      className="relative flex items-center justify-center px-8 py-10 md:px-10 md:py-12"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(37, 211, 102, 0.10), transparent 60%), radial-gradient(circle at 80% 90%, rgba(18, 140, 126, 0.10), transparent 55%), linear-gradient(180deg, rgba(8, 14, 12, 0.04) 0%, transparent 100%)",
      }}
    >
      <div className="relative">
        {/* Corner brackets */}
        <CornerBrackets active={status === "wait" || status === "scanned"} />

        <div
          className="relative h-56 w-56 overflow-hidden rounded-[28px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_50px_-30px_rgba(18,140,126,0.55)] sm:h-64 sm:w-64"
          style={{
            background:
              "linear-gradient(155deg, #0d1311 0%, #0a0f0d 50%, #060b09 100%)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          {/* QR */}
          {showQR && (
            <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-white">
              <img
                src={qrDataURI}
                alt="WhatsApp QR Code"
                className="h-full w-full select-none"
                draggable={false}
                style={{
                  imageRendering: "pixelated",
                  animation: "fadeSlideIn 0.4s ease-out",
                }}
              />
              {/* Scan line */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-14"
                style={{
                  background: `linear-gradient(180deg, transparent 0%, rgba(37, 211, 102, 0.0) 10%, rgba(37, 211, 102, 0.35) 50%, rgba(37, 211, 102, 0.0) 90%, transparent 100%)`,
                  filter: "blur(2px)",
                  animation: "waScanline 2.8s ease-in-out infinite",
                  mixBlendMode: "screen",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${WA_GREEN}, transparent)`,
                  animation: "waScanline 2.8s ease-in-out infinite",
                }}
              />
              {/* WhatsApp logo bezel */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-4 border-white"
                  style={{ background: WA_GREEN }}
                >
                  <IconBrandWhatsapp size={20} className="text-white" />
                </div>
              </div>
            </div>
          )}

          {showSpinner && !showQR && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
              <IconLoader2 className="h-7 w-7 animate-spin" />
              <p className="text-xs tracking-wide">
                {status === "scanned"
                  ? t("channels.whatsappNative.confirmOnPhone")
                  : t("channels.whatsappNative.generating")}
              </p>
            </div>
          )}

          {showConfirmed && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${WA_GREEN}, ${WA_GREEN_DEEP})`,
                  boxShadow: "0 10px 30px -10px rgba(37, 211, 102, 0.7)",
                }}
              >
                <IconCheck size={28} className="text-white" strokeWidth={3} />
              </div>
              <p className="text-[11px] tracking-[0.18em] text-white/60 uppercase">
                {t("channels.whatsappNative.linked")}
              </p>
              {phoneNumber && (
                <p
                  className="text-sm font-medium text-white"
                  style={{ fontFeatureSettings: '"tnum"' }}
                >
                  {maskPhone(phoneNumber)}
                </p>
              )}
            </div>
          )}

          {showExpired && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
                <IconRefresh size={22} className="text-amber-300" />
              </div>
              <p className="px-6 text-center text-xs leading-relaxed">
                {t("channels.whatsappNative.expiredHint")}
              </p>
            </div>
          )}

          {showError && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
                <IconX size={22} className="text-red-300" />
              </div>
              <p className="px-6 text-center text-xs leading-relaxed">
                {t("channels.whatsappNative.errorGeneric")}
              </p>
            </div>
          )}

          {showOffline && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-white/60">
              <IconBrandWhatsapp size={28} className="text-white/40" />
              <p className="text-[11px] tracking-[0.18em] uppercase">
                {status === "disabled"
                  ? t("channels.whatsappNative.disabledHint")
                  : t("channels.whatsappNative.offlineHint")}
              </p>
            </div>
          )}

          {showIdle && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
              <IconLoader2 className="h-6 w-6 animate-spin opacity-70" />
              <p className="text-[11px] tracking-[0.18em] uppercase">
                {t("channels.whatsappNative.starting")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CornerBrackets({ active }: { active: boolean }) {
  const color = active ? WA_GREEN : "rgba(120, 130, 125, 0.35)"
  const animation = active
    ? "waCornerPulse 2.2s ease-in-out infinite"
    : undefined
  const base = {
    position: "absolute" as const,
    width: 18,
    height: 18,
    borderColor: color,
    animation,
  }
  return (
    <>
      <span
        aria-hidden
        style={{
          ...base,
          top: -8,
          left: -8,
          borderTop: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          borderTopLeftRadius: 6,
        }}
      />
      <span
        aria-hidden
        style={{
          ...base,
          top: -8,
          right: -8,
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          borderTopRightRadius: 6,
        }}
      />
      <span
        aria-hidden
        style={{
          ...base,
          bottom: -8,
          left: -8,
          borderBottom: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          borderBottomLeftRadius: 6,
        }}
      />
      <span
        aria-hidden
        style={{
          ...base,
          bottom: -8,
          right: -8,
          borderBottom: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          borderBottomRightRadius: 6,
        }}
      />
    </>
  )
}

function Instructions({
  status,
  errorMessage,
  refreshing,
  refreshError,
  onRefresh,
}: {
  status: PairingStatus
  errorMessage: string
  refreshing: boolean
  refreshError: string
  onRefresh: () => void
}) {
  const { t } = useTranslation()

  const canRefresh =
    status === "expired" ||
    status === "error" ||
    status === "offline" ||
    status === "wait" ||
    status === "scanned"

  const items = [
    {
      key: "1",
      title: t("channels.whatsappNative.step1Title"),
      desc: t("channels.whatsappNative.step1Desc"),
    },
    {
      key: "2",
      title: t("channels.whatsappNative.step2Title"),
      desc: t("channels.whatsappNative.step2Desc"),
    },
    {
      key: "3",
      title: t("channels.whatsappNative.step3Title"),
      desc: t("channels.whatsappNative.step3Desc"),
    },
    {
      key: "4",
      title: t("channels.whatsappNative.step4Title"),
      desc: t("channels.whatsappNative.step4Desc"),
    },
  ]

  return (
    <div className="border-border/60 flex flex-col gap-5 px-6 py-8 md:border-l md:px-8 md:py-10">
      <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
        {t("channels.whatsappNative.howTo")}
      </p>

      <ol className="space-y-4">
        {items.map((item, idx) => {
          const reached = idx === 0 || status !== "idle"
          return (
            <li key={item.key} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: reached
                    ? "rgba(37, 211, 102, 0.12)"
                    : "var(--muted)",
                  color: reached ? WA_GREEN_DEEP : "var(--muted-foreground)",
                  border: reached
                    ? `1px solid ${WA_GREEN}33`
                    : "1px solid transparent",
                }}
              >
                {item.key}
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-sm leading-tight font-medium">
                  {item.title}
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      {status === "error" && errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <p className="font-mono text-[11px] break-all text-red-600 dark:text-red-300">
            {errorMessage}
          </p>
        </div>
      )}

      {canRefresh && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={onRefresh}
            className="self-start gap-2"
            style={{
              borderColor:
                status === "expired" || status === "error"
                  ? `${WA_GREEN}66`
                  : undefined,
            }}
          >
            {refreshing ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconRefresh size={14} />
            )}
            {refreshing
              ? t("channels.whatsappNative.refreshing")
              : t("channels.whatsappNative.refresh")}
          </Button>
          {refreshError && (
            <p className="text-[11px] text-red-600 dark:text-red-300">
              {refreshError}
            </p>
          )}
        </div>
      )}

      {(status === "expired" ||
        status === "error" ||
        status === "offline" ||
        status === "disabled") && (
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {status === "disabled"
            ? t("channels.whatsappNative.disabledFootnote")
            : status === "offline"
              ? t("channels.whatsappNative.offlineFootnote")
              : t("channels.whatsappNative.retryFootnote")}
        </p>
      )}
    </div>
  )
}
