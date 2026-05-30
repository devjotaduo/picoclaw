import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Save, ShieldAlert, XCircle } from "lucide-react";

import { getClaudeCLIAuth, updateClaudeCLIAuth } from "@/api/platform-cli-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function PlatformClaudeAuth() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["platform-claude-auth"], queryFn: getClaudeCLIAuth });
  const [token, setToken] = useState("");

  const saveM = useMutation({
    mutationFn: () => updateClaudeCLIAuth(token.trim()),
    onSuccess: () => {
      setToken("");
      qc.invalidateQueries({ queryKey: ["platform-claude-auth"] });
      toast({ type: "success", message: "Token do Claude atualizado para todos os tenants claude-cli." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao salvar o token." }),
  });

  const data = q.data;
  const configured = Boolean(data?.configured);
  const dirConfigured = Boolean(data?.dir_configured);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Token Claude (CLI compartilhado)</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Token long-lived do Claude (subscription) usado por todos os tenants com provider claude-cli.
          </p>
        </div>
        <Badge
          className={
            configured
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-700 bg-zinc-900 text-zinc-400"
          }
        >
          {configured ? "configurado" : "não configurado"}
        </Badge>
      </header>

      {q.isError ? (
        <Alert className="mb-4 border-red-900/50 bg-red-950/30 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Falha ao carregar status</AlertTitle>
          <AlertDescription>
            {(q.error as { error?: string })?.error ?? "erro desconhecido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {q.data && !dirConfigured ? (
        <Alert className="mb-4 border-red-900/50 bg-red-950/30 text-red-300">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Diretório de auth não configurado</AlertTitle>
          <AlertDescription>
            Defina <code>PICOCLAW_TENANT_CLAUDE_CLI_AUTH_DIR</code> no controlplane (e monte-o
            read-write) para gerenciar o token por aqui.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              Token compartilhado
            </CardTitle>
            <CardDescription>
              Gere com <code>claude setup-token</code> na sua máquina (login da subscription) e cole
              o token <code>sk-ant-oat…</code> abaixo. Ele é gravado no diretório montado read-only
              em todos os tenants claude-cli — sem expiração diária.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configured ? (
              <div className="text-xs text-zinc-500">
                Token atual:{" "}
                <span className="font-mono text-zinc-300">{data?.token_preview ?? "—"}</span>
                {data?.updated_at ? (
                  <> · atualizado em {new Date(data.updated_at).toLocaleString()}</>
                ) : null}
              </div>
            ) : null}

            <Field>
              <FieldLabel htmlFor="claude-token">Token (sk-ant-oat…)</FieldLabel>
              <Input
                id="claude-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={configured ? "Cole um novo token para rotacionar" : "sk-ant-oat01-…"}
              />
              <FieldDescription>
                Gerado por <code>claude setup-token</code>. Vale ~1 ano — rotacione aqui quando
                expirar; vale para todos os tenants de uma vez.
              </FieldDescription>
            </Field>

            <div className="flex justify-end">
              <Button
                onClick={() => saveM.mutate()}
                disabled={!token.trim() || !dirConfigured || saveM.isPending}
              >
                <Save className="h-4 w-4" />
                {saveM.isPending ? "Salvando..." : "Salvar token"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
