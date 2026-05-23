import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { submitPasswordReset } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "Jota Duo";
const COMPANY_LOGO_SRC = "/jota-duo-logo.png";

const authInputClassName =
  "h-11 rounded-xl border-white/14 bg-white/[0.035] text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/32 focus:border-violet-300/70 focus-visible:border-violet-300/70 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_rgba(18,18,34,0.98)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff] [&:-webkit-autofill]:caret-white";

const MIN_PASSWORD_LEN = 8;

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!token) {
        setError("Link inválido ou expirado. Solicite um novo.");
        return;
      }
      if (password.length < MIN_PASSWORD_LEN) {
        setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LEN} caracteres.`);
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
      setError("");
      setBusy(true);
      try {
        await submitPasswordReset(token, password);
        setDone(true);
        setTimeout(() => navigate("/login", { replace: true }), 2500);
      } catch (err) {
        const msg =
          err && typeof err === "object" && "error" in err
            ? String((err as { error: unknown }).error)
            : "Link inválido ou expirado. Solicite um novo.";
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [token, password, confirmPassword, navigate],
  );

  const tokenMissing = !token;

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
          {done ? (
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10">
                <CheckCircle2 className="size-6 text-emerald-200" />
              </div>
              <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                Senha redefinida
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/68">
                Sua nova senha está ativa. Redirecionando para o login…
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
              >
                <ArrowRight className="size-4" />
                Ir para o login agora
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h2 className="text-xl font-black tracking-normal text-white sm:text-2xl">
                  Definir nova senha
                </h2>
                <p className="mt-2.5 text-sm text-white/62">
                  Escolha uma nova senha para sua conta administrativa.
                </p>
              </div>

              {tokenMissing ? (
                <div className="mt-5">
                  <p
                    className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100"
                    role="alert"
                  >
                    Link inválido — o token de redefinição não foi encontrado na
                    URL. Solicite um novo link na tela de recuperação.
                  </p>
                  <Link
                    to="/forgot-password"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
                  >
                    Solicitar novo link
                  </Link>
                </div>
              ) : (
                <form className="mt-5 flex flex-col gap-3.5" onSubmit={submit}>
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="new-password"
                      className="text-sm font-medium text-white/82"
                    >
                      Nova senha
                    </label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                      <Input
                        id="new-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={MIN_PASSWORD_LEN}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`Pelo menos ${MIN_PASSWORD_LEN} caracteres`}
                        className={cn(authInputClassName, "px-10")}
                      />
                      <button
                        type="button"
                        className="absolute top-1/2 right-3.5 -translate-y-1/2 text-white/46 transition-colors hover:text-white"
                        onClick={() => setShowPassword((v) => !v)}
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

                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="confirm-password"
                      className="text-sm font-medium text-white/82"
                    >
                      Confirmar nova senha
                    </label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/46" />
                      <Input
                        id="confirm-password"
                        name="confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={MIN_PASSWORD_LEN}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
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
                      "Salvando…"
                    ) : (
                      <>
                        Redefinir senha
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
              )}
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
