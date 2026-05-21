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
      setClientError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setClientError("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      setClientError("New password must differ from the current password.");
      return;
    }
    m.mutate();
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-zinc-100">Change password</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Update the password used to sign in to the SaaS admin. You'll stay
            signed in on this device after the change.
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-5"
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="current">Current password</Label>
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
              <Label htmlFor="next">New password</Label>
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
              <Label htmlFor="confirm">Confirm new password</Label>
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
                Password updated.
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => nav(-1)}
                disabled={m.isPending}
              >
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={m.isPending}>
                {m.isPending ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
