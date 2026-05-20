import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  KeyRound,
  MessageCircle,
  ShieldCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "Jota Duo";
const COMPANY_LOGO_SRC = "/jota-duo-logo.png";
const REMEMBER_EMAIL_KEY = "jota-duo-admin-login-email";

const benefitCards = [
  {
    title: "Gestão de tenants",
    description: "Provisione, suspenda e clone clientes em poucos cliques.",
    icon: UsersRound,
  },
  {
    title: "Operação centralizada",
    description: "Saúde, métricas e auditoria em uma visão única.",
    icon: Zap,
  },
  {
    title: "Suporte ágil",
    description: "Acesso direto aos painéis e canais de cada tenant.",
    icon: MessageCircle,
  },
];

const authInputClassName =
  "h-11 rounded-xl border-white/14 bg-white/[0.035] text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/32 focus:border-violet-300/70 focus-visible:border-violet-300/70 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(18,18,34,0.98)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:caret-white";

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
    <main className="relative flex min-h-dvh overflow-x-hidden bg-[#080912] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(125,75,255,0.22),transparent_34%),radial-gradient(circle_at_78%_28%,rgba(54,102,255,0.18),transparent_32%),linear-gradient(115deg,#070812_0%,#111025_48%,#070913_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />
      <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px bg-white/8 lg:block" />

      <div className="relative z-10 grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative hidden min-h-dvh flex-col justify-between overflow-hidden px-8 py-8 lg:flex xl:px-10">
          <div className="relative z-10">
            <BrandLockup className="mb-10" />

            <div className="inline-flex rounded-full border border-violet-300/25 bg-violet-400/8 px-3.5 py-1.5 text-[0.68rem] font-semibold tracking-[0.15em] text-violet-200 uppercase shadow-[0_0_28px_rgba(139,92,246,0.18)]">
              Painel administrativo
            </div>

            <h1 className="mt-5 max-w-[31rem] text-[clamp(1.85rem,2.7vw,3rem)] leading-[1.08] font-black tracking-normal text-balance">
              Controle total da plataforma Jota Duo{" "}
              <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                em um único lugar.
              </span>
            </h1>

            <p className="mt-4 max-w-md text-sm leading-6 text-white/68">
              Gerencie tenants, perfis, modelos e canais com segurança e
              auditoria centralizadas.
            </p>

            <div className="mt-6 grid max-w-[39rem] grid-cols-3 gap-3">
              {benefitCards.map((card) => (
                <BenefitCard key={card.title} {...card} />
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-xs text-white/42">
            <ShieldCheck className="size-4 text-violet-200/55" />
            Acesso restrito · ações registradas e auditadas.
          </div>

          <div className="pointer-events-none absolute top-1/2 right-[-13.5rem] h-[28rem] w-[28rem] -translate-y-1/2 opacity-90">
            <LoginOrb variant="hero" />
          </div>
        </section>

        <section className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <BrandLockup className="lg:hidden" compact />
          </div>

          <div className="flex flex-1 items-center justify-center py-5">
            <div className="w-full max-w-[27rem] rounded-[1.15rem] border border-white/12 bg-white/[0.045] p-4 shadow-[0_22px_68px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-5 lg:max-w-[29rem] lg:p-6 xl:p-7">
              <div className="mx-auto mb-3 size-16 lg:hidden">
                <LoginOrb variant="compact" />
              </div>

              <div className="text-center">
                <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                  Entrar no painel
                </h2>
                <p className="mt-2.5 text-sm text-white/62">
                  Acesso administrativo da plataforma Jota Duo
                </p>
              </div>

              <form className="mt-5 flex flex-col gap-3.5" onSubmit={submit}>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="admin-email"
                    className="text-sm font-medium text-white/82"
                  >
                    E-mail
                  </label>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                    <Input
                      id="admin-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@empresa.com"
                      className={cn(authInputClassName, "pl-10")}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="admin-password"
                    className="text-sm font-medium text-white/82"
                  >
                    Senha
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                    <Input
                      id="admin-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua senha"
                      className={cn(authInputClassName, "px-10")}
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 right-3.5 -translate-y-1/2 text-white/46 transition-colors hover:text-white"
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
                  <label className="flex w-fit items-center gap-2.5 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                      className="size-4 rounded border-white/18 bg-white/8 accent-violet-500"
                    />
                    Lembrar de mim
                  </label>
                  <a
                    href="mailto:dev@jotaduo.com?subject=Recuperar%20acesso%20admin%20Jota%20Duo"
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
                  disabled={busy}
                  className="mt-0.5 h-11 w-full rounded-xl border border-violet-300/20 bg-gradient-to-r from-violet-500 via-indigo-500 to-violet-600 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(99,102,241,0.28)] hover:brightness-110 hover:bg-gradient-to-r hover:from-violet-500 hover:via-indigo-500 hover:to-violet-600"
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

                <div className="flex items-center gap-4 py-1.5 text-xs text-white/36">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>Acesso seguro</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <p className="text-center text-xs text-white/55 sm:text-sm">
                  Precisa de acesso?{" "}
                  <a
                    href="mailto:dev@jotaduo.com?subject=Acesso%20admin%20Jota%20Duo"
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
  );
}

interface BrandLockupProps {
  className?: string;
  compact?: boolean;
}

function BrandLockup({ className, compact = false }: BrandLockupProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-4", className)}>
      <img
        src={COMPANY_LOGO_SRC}
        alt={COMPANY_NAME}
        className={cn("w-auto object-contain", compact ? "h-8" : "h-12")}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

interface BenefitCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
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
  );
}

interface LoginOrbProps {
  variant: "hero" | "compact";
}

function LoginOrb({ variant }: LoginOrbProps) {
  const hero = variant === "hero";
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      aria-hidden="true"
    >
      <div
        className={cn(
          "absolute rounded-full border border-violet-300/18 admin-orb-ring-slow",
          hero ? "size-[25rem]" : "size-[12rem]",
        )}
        style={{ opacity: hero ? 0.72 : 0.36 }}
      />
      <div
        className={cn(
          "absolute rounded-full border border-indigo-300/16 admin-orb-ring-fast",
          hero ? "size-[19rem]" : "size-[9.5rem]",
        )}
        style={{ opacity: hero ? 0.86 : 0.42 }}
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-full admin-orb-core",
          hero ? "size-56" : "size-28",
        )}
        style={{
          background:
            "radial-gradient(circle at 30% 26%, #fff4b7 0%, #ff9a52 18%, #c02eff 42%, #256bff 70%, #040b24 100%)",
          boxShadow:
            "0 0 42px rgba(139,92,246,0.58), 0 0 100px rgba(37,99,235,0.34)",
        }}
      >
        <div className="absolute inset-0 mix-blend-screen bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.78),transparent_16%),radial-gradient(circle_at_54%_58%,rgba(255,255,255,0.15),transparent_24%)]" />
        <div className="absolute inset-3 rounded-full border border-white/26 admin-orb-inner-ring" />
      </div>
    </div>
  );
}
