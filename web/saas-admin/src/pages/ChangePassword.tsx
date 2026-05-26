import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { changePassword } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ChangePassword() {
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  const serverError =
    m.error && typeof m.error === "object" && "error" in m.error
      ? String((m.error as { error: unknown }).error)
      : null;
  const errMsg = clientError ?? serverError;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientError(null);
    if (next.length < 8) {
      setClientError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      setClientError("A nova senha e a confirmação não conferem.");
      return;
    }
    if (next === current) {
      setClientError("A nova senha precisa ser diferente da senha atual.");
      return;
    }
    m.mutate();
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-zinc-100">Alterar senha</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Atualize a senha usada para entrar no painel. Você continuará
            conectado neste dispositivo depois da alteração.
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5"
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="current">Senha atual</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="next">Nova senha</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {errMsg && (
              <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">
                {errMsg}
              </div>
            )}
            {m.isSuccess && !clientError && (
              <div className="rounded bg-emerald-950/50 px-3 py-2 text-xs text-emerald-300">
                Senha atualizada.
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => nav(-1)}
                disabled={m.isPending}
              >
                Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={m.isPending}>
                {m.isPending ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
