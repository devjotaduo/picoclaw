import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AtSign, Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "Jota Duo";
const COMPANY_LOGO_SRC = "/jota-duo-logo.png";
const REMEMBER_EMAIL_KEY = "jota-duo-admin-login-email";

const authInputClassName =
  "h-10 rounded-md border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus-visible:border-primary [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--background)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--foreground)] [&:-webkit-autofill]:caret-foreground";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = globalThis.localStorage?.getItem(REMEMBER_EMAIL_KEY);
    if (!saved) return;
    setEmail(saved);
    setRememberEmail(true);
  }, []);

  const handleTogglePassword = useCallback(() => {
    setShowPassword((v) => !v);
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const emailValue = email.trim();
      const passwordValue = password.trim();
      if (!emailValue) {
        setError("Informe seu e-mail.");
        return;
      }
      if (!passwordValue) {
        setError("Informe sua senha.");
        return;
      }
      setError("");
      setBusy(true);
      try {
        await signIn(emailValue, passwordValue);
        if (rememberEmail) {
          globalThis.localStorage?.setItem(REMEMBER_EMAIL_KEY, emailValue);
        } else {
          globalThis.localStorage?.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch (err) {
        const msg =
          err && typeof err === "object" && "error" in err
            ? String((err as { error: unknown }).error)
            : "E-mail ou senha inválidos.";
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [email, password, rememberEmail, signIn],
  );

  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-border/50 flex h-14 shrink-0 items-center justify-end border-b px-4">
        <span className="text-muted-foreground text-xs">
          Painel administrativo
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <section className="border-border bg-card text-card-foreground w-full max-w-md rounded-lg border p-6 shadow-sm">
          <div className="text-center">
            <img
              src={COMPANY_LOGO_SRC}
              alt={COMPANY_NAME}
              className="mx-auto mb-4 h-10 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <h1 className="text-xl font-semibold tracking-tight">
              Entrar no painel
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Acesso administrativo da plataforma Jota Duo
            </p>
          </div>

          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <label htmlFor="admin-email" className="text-sm font-medium">
                E-mail
              </label>
              <div className="relative">
                <AtSign className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className={cn(authInputClassName, "pl-9")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="admin-password" className="text-sm font-medium">
                Senha
              </label>
              <div className="relative">
                <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className={cn(authInputClassName, "px-9")}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  onClick={handleTogglePassword}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-muted-foreground flex w-fit items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="border-input bg-background text-primary focus-visible:ring-ring size-4 rounded border accent-brand-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                />
                Lembrar de mim
              </label>
              <Link
                to="/forgot-password"
                className="text-primary text-sm font-medium transition-colors hover:opacity-85"
              >
                Esqueci minha senha
              </Link>
            </div>

            {error ? (
              <p
                className="text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-relaxed"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={busy}
              className="h-10 w-full justify-between"
            >
              {busy ? (
                "Entrando…"
              ) : (
                <>
                  Entrar
                  <ArrowRight className="ml-auto size-4" />
                </>
              )}
            </Button>

            <div className="text-muted-foreground flex items-center gap-4 py-1 text-xs">
              <span className="bg-border h-px flex-1" />
              <span>Acesso seguro</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <p className="text-muted-foreground text-center text-sm">
              Precisa de acesso?{" "}
              <a
                href="mailto:dev@jotaduo.com?subject=Acesso%20admin%20Jota%20Duo"
                className="text-primary font-medium transition-colors hover:opacity-85"
              >
                Fale com a equipe Jota Duo
              </a>
            </p>
          </form>
        </section>
      </div>

      <p className="text-muted-foreground pb-4 text-center text-xs">
        © 2026 Jota Duo. Todos os direitos reservados.
      </p>
    </main>
  );
}
