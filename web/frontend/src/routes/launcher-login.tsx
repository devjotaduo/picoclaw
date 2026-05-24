import {
  IconEye,
  IconEyeOff,
  IconLanguage,
  IconMoon,
  IconSun,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import {
  getLauncherAuthStatus,
  postLauncherDashboardLogin,
  postLauncherPasswordRecovery,
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

const LAUNCHER_REMEMBER_LOGIN_KEY = "jotaduo.launcherLogin.remembered"

type RememberedLauncherLogin = {
  email: string
  password: string
}

function readRememberedLauncherLogin(): RememberedLauncherLogin | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAUNCHER_REMEMBER_LOGIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RememberedLauncherLogin>
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.password !== "string"
    ) {
      return null
    }
    return { email: parsed.email, password: parsed.password }
  } catch {
    return null
  }
}

function writeRememberedLauncherLogin(credentials: RememberedLauncherLogin) {
  try {
    globalThis.localStorage?.setItem(
      LAUNCHER_REMEMBER_LOGIN_KEY,
      JSON.stringify(credentials),
    )
  } catch {
    /* Local storage may be unavailable in restricted browser modes. */
  }
}

function clearRememberedLauncherLogin() {
  try {
    globalThis.localStorage?.removeItem(LAUNCHER_REMEMBER_LOGIN_KEY)
  } catch {
    /* ignore */
  }
}

function LauncherLoginPage() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [rememberLogin, setRememberLogin] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [recovering, setRecovering] = React.useState(false)
  const [recoverySent, setRecoverySent] = React.useState(false)
  const [error, setError] = React.useState("")

  // If no password has been set yet, this is a first-run install — bounce
  // to the setup flow so the operator can create one.
  React.useEffect(() => {
    const remembered = readRememberedLauncherLogin()
    if (remembered) {
      setEmail(remembered.email)
      setPassword(remembered.password)
      setRememberLogin(true)
    }

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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const emailValue = email.trim()
    const pw = password.trim()
    if (!emailValue) {
      setError(t("launcherLogin.errorEmailRequired"))
      return
    }
    if (!pw) {
      setError(t("launcherLogin.errorPasswordRequired"))
      return
    }
    setSubmitting(true)
    try {
      const result = await postLauncherDashboardLogin(emailValue, pw)
      if (result.ok) {
        if (rememberLogin) {
          writeRememberedLauncherLogin({ email: emailValue, password: pw })
        } else {
          clearRememberedLauncherLogin()
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
  }

  const onRecoverPassword = async () => {
    setError("")
    setRecoverySent(false)
    const emailValue = email.trim()
    if (!emailValue) {
      setError(t("launcherLogin.errorEmailRequired"))
      return
    }
    setRecovering(true)
    try {
      await postLauncherPasswordRecovery(emailValue)
      setRecoverySent(true)
    } catch {
      setError(t("launcherLogin.errorNetwork"))
    } finally {
      setRecovering(false)
    }
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border/50 flex h-14 shrink-0 items-center justify-end gap-2 border-b px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Language">
              <IconLanguage className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => i18n.changeLanguage("pt-br")}>
              Português
            </DropdownMenuItem>
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
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md" size="sm">
          <CardHeader className="items-center text-center">
            <img
              src="/jota-duo-logo.png"
              alt="Jota Duo"
              className="mb-2 h-10 w-auto object-contain"
            />
            <CardTitle>{t("launcherLogin.title")}</CardTitle>
            <CardDescription>{t("launcherLogin.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="launcher-email">
                  {t("launcherLogin.emailLabel")}
                </Label>
                <Input
                  id="launcher-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("launcherLogin.emailPlaceholder")}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="launcher-password">
                  {t("launcherLogin.passwordLabel")}
                </Label>
                <div className="relative">
                  <Input
                    id="launcher-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("launcherLogin.passwordPlaceholder")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? t("launcherLogin.hidePassword")
                        : t("launcherLogin.showPassword")
                    }
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <IconEyeOff className="size-4" />
                    ) : (
                      <IconEye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="text-muted-foreground flex cursor-pointer items-start gap-3 text-sm leading-5">
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => {
                    setRememberLogin(e.target.checked)
                    if (!e.target.checked) {
                      clearRememberedLauncherLogin()
                    }
                  }}
                  className="border-input bg-background text-primary focus-visible:ring-ring mt-0.5 size-4 rounded border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                />
                <span>{t("launcherLogin.rememberLogin")}</span>
              </label>

              <Button type="submit" disabled={submitting}>
                {submitting ? t("labels.loading") : t("launcherLogin.submit")}
              </Button>

              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                disabled={recovering}
                onClick={() => void onRecoverPassword()}
              >
                {recovering
                  ? t("labels.loading")
                  : t("launcherLogin.forgotPassword", {
                      defaultValue: "Esqueci minha senha",
                    })}
              </Button>

              {recoverySent ? (
                <p className="text-muted-foreground text-sm" role="status">
                  {t("launcherLogin.recoverySent", {
                    defaultValue:
                      "Se esse email for o dono do painel, enviaremos uma nova senha em alguns minutos.",
                  })}
                </p>
              ) : null}

              {error ? (
                <p className="text-destructive text-sm" role="alert">
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
