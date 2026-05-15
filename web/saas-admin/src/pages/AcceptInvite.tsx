import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { acceptInvite } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

export function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const initialToken = useMemo(() => params.get("token") ?? "", [params]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");

  const m = useMutation({
    mutationFn: () => acceptInvite(token, password),
    onSuccess: async (res) => {
      await refresh();
      nav(`/tenants/${res.tenant_id}`, { replace: true });
    },
  });

  const errMsg =
    m.error && typeof m.error === "object" && "error" in m.error
      ? String((m.error as { error: unknown }).error)
      : null;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/70 p-5"
      >
        <h1 className="mb-4 text-lg font-semibold">Accept invite</h1>
        <div className="space-y-3">
          <div>
            <Label htmlFor="token">Invite token</Label>
            <Input id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {errMsg && <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{errMsg}</div>}
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Accepting..." : "Accept invite"}
          </Button>
        </div>
      </form>
    </div>
  );
}

