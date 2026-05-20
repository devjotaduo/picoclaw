import {
  IconArrowRight,
  IconAt,
  IconBolt,
  IconEye,
  IconEyeOff,
  IconKey,
  IconMessageCircle,
  IconShieldCheck,
  IconUsersGroup,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { Thumbnail } from "@remotion/player"
import * as React from "react"
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"
import { useTranslation } from "react-i18next"

import {
  getLauncherAuthStatus,
  postLauncherDashboardLogin,
} from "@/api/launcher-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const COMPANY_NAME = "Jota Duo"
const COMPANY_LOGO_SRC = "/jota-duo-logo.png"
const REMEMBER_EMAIL_KEY = "jota-duo-login-email"
const ORB_DURATION_IN_FRAMES = 210
const ORB_FPS = 30

const benefitCards = [
  {
    title: "Atendimento inteligente",
    description: "Respostas mais rápidas e conversas que geram resultado.",
    icon: IconMessageCircle,
  },
  {
    title: "Automação de processos",
    description: "Fluxos e tarefas automáticas para ganhar produtividade.",
    icon: IconBolt,
  },
  {
    title: "Gestão centralizada",
    description: "Operação, agentes e canais em uma visão única.",
    icon: IconUsersGroup,
  },
]

const authInputClassName =
  "h-11 rounded-xl border-white/14 bg-white/[0.035] text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/32 focus-visible:border-violet-300/70 focus-visible:ring-violet-400/20 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(18,18,34,0.98)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:caret-white"

function LauncherLoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [rememberEmail, setRememberEmail] = React.useState(true)
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    const savedEmail = globalThis.localStorage?.getItem(REMEMBER_EMAIL_KEY)
    if (!savedEmail) {
      return
    }
    setEmail(savedEmail)
    setRememberEmail(true)
  }, [])

  // If the password store has never been initialized, go to setup instead.
  React.useEffect(() => {
    void getLauncherAuthStatus()
      .then((s) => {
        if (!s.initialized) {
          globalThis.location.assign("/launcher-setup")
        }
      })
      .catch(() => {
        /* network error: stay on login page */
      })
  }, [])

  const handleEmailChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value)
    },
    [],
  )

  const handlePasswordChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value)
    },
    [],
  )

  const handleRememberChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRememberEmail(e.target.checked)
    },
    [],
  )

  const handleTogglePassword = React.useCallback(() => {
    setShowPassword((v) => !v)
  }, [])

  const loginWithPassword = React.useCallback(
    async (emailValue: string, passwordValue: string) => {
      setError("")
      setSubmitting(true)
      try {
        const result = await postLauncherDashboardLogin(
          passwordValue,
          emailValue,
        )
        if (result.ok) {
          if (rememberEmail) {
            globalThis.localStorage?.setItem(REMEMBER_EMAIL_KEY, emailValue)
          } else {
            globalThis.localStorage?.removeItem(REMEMBER_EMAIL_KEY)
          }
          globalThis.location.assign("/")
          return
        }
        if (result.status === 409) {
          globalThis.location.assign("/launcher-setup")
          return
        }
        if (result.status === 401) {
          setError(t("launcherLogin.errorInvalid"))
          return
        }
        setError(result.error)
      } catch {
        setError(t("launcherLogin.errorNetwork"))
      } finally {
        setSubmitting(false)
      }
    },
    [rememberEmail, t],
  )

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const emailValue = email.trim()
      const passwordValue = password.trim()
      if (!emailValue) {
        setError(t("launcherLogin.errorEmailRequired"))
        return
      }
      if (!passwordValue) {
        setError(t("launcherLogin.errorPasswordRequired"))
        return
      }
      await loginWithPassword(emailValue, passwordValue)
    },
    [email, loginWithPassword, password, t],
  )

  return (
    <main className="relative flex min-h-dvh overflow-x-hidden bg-[#080912] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(125,75,255,0.22),transparent_34%),radial-gradient(circle_at_78%_28%,rgba(54,102,255,0.18),transparent_32%),linear-gradient(115deg,#070812_0%,#111025_48%,#070913_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />
      <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px bg-white/8 lg:block" />

      <div className="relative z-10 grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative hidden min-h-dvh flex-col justify-between overflow-hidden px-8 py-8 lg:flex xl:px-10">
          <div className="relative z-10">
            <BrandLockup className="mb-10" />

            <div className="inline-flex rounded-full border border-violet-300/25 bg-violet-400/8 px-3.5 py-1.5 text-[0.68rem] font-semibold tracking-[0.15em] text-violet-200 uppercase shadow-[0_0_28px_rgba(139,92,246,0.18)]">
              Plataforma de agentes de IA
            </div>

            <h1 className="mt-5 max-w-[31rem] text-[clamp(1.85rem,2.7vw,3rem)] leading-[1.08] font-black tracking-normal text-balance">
              Agentes de IA para empresas que querem escalar{" "}
              <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                atendimento, vendas e operação.
              </span>
            </h1>

            <p className="mt-4 max-w-md text-sm leading-6 text-white/68">
              Automação inteligente, conversas humanizadas e gestão centralizada
              para resultados reais.
            </p>

            <div className="mt-6 grid max-w-[39rem] grid-cols-3 gap-3">
              {benefitCards.map((card) => (
                <BenefitCard key={card.title} {...card} />
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-xs text-white/42">
            <IconShieldCheck className="size-4 text-violet-200/55" />
            Segurança, privacidade e IA responsável em cada interação.
          </div>

          <div className="pointer-events-none absolute top-1/2 right-[-13.5rem] h-[28rem] w-[28rem] -translate-y-1/2 opacity-90">
            <LoginOrbPlayer variant="hero" />
          </div>
        </section>

        <section className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <BrandLockup className="lg:hidden" compact />
          </div>

          <div className="flex flex-1 items-center justify-center py-5">
            <div className="w-full max-w-[27rem] rounded-[1.15rem] border border-white/12 bg-white/[0.045] p-4 shadow-[0_22px_68px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-5 lg:max-w-[29rem] lg:p-6 xl:p-7">
              <div className="mx-auto mb-3 size-16 lg:hidden">
                <LoginOrbPlayer variant="compact" />
              </div>

              <div className="text-center">
                <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                  Entrar na sua conta
                </h2>
                <p className="mt-2.5 text-sm text-white/62">
                  Acesse a plataforma Jota Duo
                </p>
              </div>

              <form className="mt-5 flex flex-col gap-3.5" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="launcher-email"
                    className="text-sm font-medium text-white/82"
                  >
                    E-mail
                  </Label>
                  <div className="relative">
                    <IconAt className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                    <Input
                      id="launcher-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={handleEmailChange}
                      placeholder={t("launcherLogin.emailPlaceholder")}
                      className={cn(authInputClassName, "pl-10")}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="launcher-password"
                    className="text-sm font-medium text-white/82"
                  >
                    Senha
                  </Label>
                  <div className="relative">
                    <IconKey className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                    <Input
                      id="launcher-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={handlePasswordChange}
                      placeholder={t("launcherLogin.passwordPlaceholder")}
                      className={cn(authInputClassName, "px-10")}
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 right-3.5 -translate-y-1/2 text-white/46 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                      onClick={handleTogglePassword}
                      aria-label={
                        showPassword
                          ? t("launcherLogin.hidePassword")
                          : t("launcherLogin.showPassword")
                      }
                    >
                      {showPassword ? (
                        <IconEyeOff className="size-4" />
                      ) : (
                        <IconEye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex w-fit items-center gap-2.5 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={handleRememberChange}
                      className="size-4 rounded border-white/18 bg-white/8 accent-violet-500"
                    />
                    Lembrar de mim
                  </label>
                  <a
                    href="mailto:dev@jotaduo.com?subject=Recuperar%20acesso%20Jota%20Duo"
                    className="text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
                  >
                    Esqueci minha senha
                  </a>
                </div>

                {error ? (
                  <p
                    className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="mt-0.5 h-11 rounded-xl border-violet-300/20 bg-gradient-to-r from-violet-500 via-indigo-500 to-violet-600 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(99,102,241,0.28)] hover:brightness-110 focus-visible:ring-violet-300/40"
                >
                  {submitting ? (
                    t("labels.loading")
                  ) : (
                    <>
                      Entrar
                      <IconArrowRight className="ml-auto size-4" />
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-4 py-1.5 text-xs text-white/36">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>Acesso seguro</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <p className="text-center text-xs text-white/55 sm:text-sm">
                  Ainda não tem conta?{" "}
                  <a
                    href="mailto:dev@jotaduo.com?subject=Acesso%20Jota%20Duo"
                    className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
                  >
                    Fale com a equipe Jota Duo
                  </a>
                </p>
              </form>
            </div>
          </div>

          <p className="pb-1 text-center text-xs text-white/28">
            © 2026 Jota Duo. Todos os direitos reservados.
          </p>
        </section>
      </div>
    </main>
  )
}

interface BrandLockupProps {
  className?: string
  compact?: boolean
}

function BrandLockup({ className, compact = false }: BrandLockupProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-4", className)}>
      <img
        src={COMPANY_LOGO_SRC}
        alt={COMPANY_NAME}
        className={cn("w-auto object-contain", compact ? "h-8" : "h-12")}
      />
    </div>
  )
}

interface BenefitCardProps {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

function BenefitCard({ title, description, icon: Icon }: BenefitCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <Icon className="mb-3 size-5 text-violet-300" />
      <h2 className="text-[0.82rem] leading-5 font-extrabold text-white">
        {title}
      </h2>
      <p className="mt-1.5 text-[0.72rem] leading-5 text-white/55">
        {description}
      </p>
    </div>
  )
}

interface LoginOrbPlayerProps {
  variant: "hero" | "compact"
}

function LoginOrbPlayer({ variant }: LoginOrbPlayerProps) {
  const frameToDisplay = useRemotionLoopFrame(
    ORB_DURATION_IN_FRAMES,
    ORB_FPS,
  )

  return (
    <div
      className="h-full w-full"
      data-login-orb={variant}
      data-login-orb-frame={frameToDisplay}
      aria-hidden="true"
    >
      <Thumbnail
        component={LoginOrbComposition}
        frameToDisplay={frameToDisplay}
        durationInFrames={ORB_DURATION_IN_FRAMES}
        compositionWidth={420}
        compositionHeight={420}
        fps={ORB_FPS}
        inputProps={{ variant }}
        style={{
          height: "100%",
          width: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  )
}

function useRemotionLoopFrame(durationInFrames: number, fps: number) {
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    const frameDurationMs = 1000 / fps
    let animationFrame = 0
    let lastTick = performance.now()
    let elapsed = 0

    const tick = (now: number) => {
      elapsed += now - lastTick
      lastTick = now

      if (elapsed >= frameDurationMs) {
        const steps = Math.floor(elapsed / frameDurationMs)
        elapsed -= steps * frameDurationMs
        setFrame((current) => (current + steps) % durationInFrames)
      }

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [durationInFrames, fps])

  return frame
}

interface LoginOrbCompositionProps {
  variant: "hero" | "compact"
}

function LoginOrbComposition({ variant }: LoginOrbCompositionProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const intro = spring({
    frame,
    fps,
    config: { damping: 58, mass: 0.8, stiffness: 82 },
  })
  const loopFrame = frame % ORB_DURATION_IN_FRAMES
  const rotation = interpolate(loopFrame, [0, ORB_DURATION_IN_FRAMES], [0, 360])
  const floatY = interpolate(
    Math.sin((frame / ORB_DURATION_IN_FRAMES) * Math.PI * 2),
    [-1, 1],
    [-10, 10],
  )
  const glow = interpolate(
    Math.sin((frame / (ORB_DURATION_IN_FRAMES / 2)) * Math.PI * 2),
    [-1, 1],
    [0.5, 0.92],
  )
  const scale = interpolate(intro, [0, 1], [0.78, 1])
  const hero = variant === "hero"

  return (
    <AbsoluteFill className="flex items-center justify-center">
      <div
        className={cn(
          "absolute rounded-full border border-violet-300/18",
          hero ? "size-[25rem]" : "size-[12rem]",
        )}
        style={{
          opacity: hero ? 0.72 : 0.36,
          transform: `rotate(${rotation}deg) scale(${scale})`,
        }}
      />
      <div
        className={cn(
          "absolute rounded-full border border-indigo-300/16",
          hero ? "size-[19rem]" : "size-[9.5rem]",
        )}
        style={{
          opacity: hero ? 0.86 : 0.42,
          transform: `rotate(${-rotation * 0.7}deg) scale(${scale})`,
        }}
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_26%,#fff4b7_0%,#ff9a52_18%,#c02eff_42%,#256bff_70%,#040b24_100%)] shadow-[0_0_42px_rgba(139,92,246,0.58),0_0_100px_rgba(37,99,235,0.34)]",
          hero ? "size-56" : "size-28",
        )}
        style={{
          opacity: glow,
          transform: `translateY(${floatY}px) scale(${scale}) rotate(${rotation * 0.12}deg)`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.78),transparent_16%),radial-gradient(circle_at_54%_58%,rgba(255,255,255,0.15),transparent_24%)] mix-blend-screen" />
        <div
          className="absolute inset-3 rounded-full border border-white/26"
          style={{ transform: `rotate(${-rotation * 1.5}deg)` }}
        />
      </div>
    </AbsoluteFill>
  )
}

export const Route = createFileRoute("/launcher-login")({
  component: LauncherLoginPage,
})
