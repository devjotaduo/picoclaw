import {
  IconAt,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLanguage,
  IconLogin,
  IconMoon,
  IconSun,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  getLauncherAuthStatus,
  postLauncherDashboardLogin,
} from "@/api/launcher-auth"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/hooks/use-theme"

const COMPANY_NAME = "Jota Duo"
const COMPANY_LOGO_SRC = "/jota-duo-logo.png"

function LauncherLoginPage() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  // If the password store has never been initialized, go to setup instead.
  React.useEffect(() => {
    void getLauncherAuthStatus()
      .then((s) => {
        if (!s.initialized) {
          globalThis.location.assign("/launcher-setup")
        }
      })
      .catch(() => {
        /* network error — stay on login page */
      })
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
    [t],
  )

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border/50 bg-background/90 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 max-w-[10rem] items-center rounded-md bg-black px-2 ring-1 ring-white/10">
            <img
              src={COMPANY_LOGO_SRC}
              alt={COMPANY_NAME}
              className="h-6 w-auto object-contain"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Language">
                <IconLanguage className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => i18n.changeLanguage("en")}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => i18n.changeLanguage("zh")}>
                简体中文
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            type="button"
            onClick={() => toggleTheme()}
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? (
              <IconSun className="size-4" />
            ) : (
              <IconMoon className="size-4" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center bg-[linear-gradient(135deg,var(--background)_0%,var(--muted)_100%)] px-4 py-8">
        <Card
          className="border-border/70 w-full max-w-[27rem] rounded-lg shadow-md"
          size="sm"
        >
          <CardHeader className="gap-2 px-5 pt-5">
            <div className="mb-2 flex w-fit items-center rounded-md bg-black px-3 py-2 ring-1 ring-white/10">
              <img
                src={COMPANY_LOGO_SRC}
                alt={COMPANY_NAME}
                className="h-10 w-auto max-w-[13rem] object-contain"
              />
            </div>
            <CardTitle className="text-xl">
              {t("launcherLogin.title")}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              {t("launcherLogin.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="launcher-email">
                  {t("launcherLogin.emailLabel")}
                </Label>
                <div className="relative">
                  <IconAt className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="launcher-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("launcherLogin.emailPlaceholder")}
                    className="h-10 pl-9"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="launcher-password">
                  {t("launcherLogin.passwordLabel")}
                </Label>
                <div className="relative">
                  <IconKey className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="launcher-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("launcherLogin.passwordPlaceholder")}
                    className="h-10 px-9"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
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
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 w-full"
              >
                {submitting ? (
                  t("labels.loading")
                ) : (
                  <>
                    <IconLogin className="size-4" />
                    {t("launcherLogin.submit")}
                  </>
                )}
              </Button>
              {error ? (
                <p
                  className="text-destructive text-sm leading-relaxed"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/launcher-login")({
  component: LauncherLoginPage,
})
