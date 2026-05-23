import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AtSign, ArrowLeft, MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "Jota Duo";
const COMPANY_LOGO_SRC = "/jota-duo-logo.png";

const authInputClassName =
  "h-11 rounded-xl border-white/14 bg-white/[0.035] text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/32 focus:border-violet-300/70 focus-visible:border-violet-300/70 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(18,18,34,0.98)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:caret-white";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const value = email.trim();
      if (!value) {
        setError("Informe seu e-mail.");
        return;
      }
      setError("");
      setBusy(true);
      try {
        await requestPasswordReset(value);
        setSubmitted(true);
      } catch {
        // backend always returns 204 to avoid leaking which emails exist;
        // any unexpected error still shows the generic confirmation so the
        // UX matches the security contract.
        setSubmitted(true);
      } finally {
        setBusy(false);
      }
    },
    [email],
  );

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#080912] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(125,75,255,0.22),transparent_34%),radial-gradient(circle_at_78%_28%,rgba(54,102,255,0.18),transparent_32%),linear-gradient(115deg,#070812_0%,#111025_48%,#070913_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

      <div className="relative z-10 flex w-full max-w-[27rem] flex-col items-center gap-6">
        <img
          src={COMPANY_LOGO_SRC}
          alt={COMPANY_NAME}
          className="h-10 w-auto object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />

        <div className="w-full rounded-[1.15rem] border border-white/12 bg-white/[0.045] p-5 shadow-[0_22px_68px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-6 lg:p-7">
          {submitted ? (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/10">
                <MailCheck className="size-6 text-violet-200" />
              </div>
              <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                Verifique seu e-mail
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/68">
                Se essa conta existir no painel Jota Duo, você receberá um e-mail
                com um link para redefinir sua senha em até alguns minutos. O
                link expira em 1 hora.
              </p>
              <p className="mt-3 text-xs text-white/45">
                Não recebeu? Verifique a caixa de spam ou peça suporte à equipe.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
              >
                <ArrowLeft className="size-4" />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                  Esqueci minha senha
                </h2>
                <p className="mt-2.5 text-sm text-white/62">
                  Informe seu e-mail e enviaremos um link para você redefinir
                  sua senha.
                </p>
              </div>

              <form className="mt-5 flex flex-col gap-3.5" onSubmit={submit}>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="forgot-email"
                    className="text-sm font-medium text-white/82"
                  >
                    E-mail
                  </label>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                    <Input
                      id="forgot-email"
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
                    "Enviando…"
                  ) : (
                    <>
                      Enviar link de recuperação
                      <ArrowRight className="ml-auto size-4" />
                    </>
                  )}
                </Button>

                <Link
                  to="/login"
                  className="mt-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
                >
                  <ArrowLeft className="size-4" />
                  Voltar para o login
                </Link>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-white/28">
          © 2026 Jota Duo. Todos os direitos reservados.
        </p>
      </div>
    </main>
  );
}
