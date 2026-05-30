import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, KeyRound, PlugZap, Save, XCircle } from "lucide-react";

import {
  getPlatformLiteLLM,
  testPlatformLiteLLM,
  updatePlatformLiteLLM,
} from "@/api/platform-litellm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function PlatformLiteLLM() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["platform-litellm"], queryFn: getPlatformLiteLLM });
  const [url, setURL] = useState("");
  const [masterKey, setMasterKey] = useState("");

  useEffect(() => {
    if (q.data) setURL(q.data.url ?? "");
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => updatePlatformLiteLLM({ url: url.trim(), master_key: masterKey.trim() || undefined }),
    onSuccess: () => {
      setMasterKey("");
      qc.invalidateQueries({ queryKey: ["platform-litellm"] });
      toast({ type: "success", message: "Configuração LiteLLM salva." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao salvar LiteLLM." }),
  });

  const testM = useMutation({
    mutationFn: testPlatformLiteLLM,
    onSuccess: () => toast({ type: "success", message: "LiteLLM respondeu com sucesso." }),
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao testar LiteLLM." }),
  });

  const data = q.data;
  const configured = Boolean(data?.configured);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">LiteLLM</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Configuração global usada para chaves virtuais e roteamento SaaS.
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
          <AlertTitle>Falha ao carregar LiteLLM</AlertTitle>
          <AlertDescription>{(q.error as { error?: string })?.error ?? "erro desconhecido"}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlugZap className="h-4 w-4 text-zinc-400" />
              Conexão
            </CardTitle>
            <CardDescription>
              O endpoint e a master key ficam no control-plane; tenants recebem somente chaves virtuais.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="litellm-url">LITELLM_URL</FieldLabel>
                <Input
                  id="litellm-url"
                  value={url}
                  onChange={(event) => setURL(event.target.value)}
                  placeholder="http://litellm:4000"
                />
                <FieldDescription>Fonte atual: {data?.url_source ?? "none"}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-master-key">LITELLM_MASTER_KEY</FieldLabel>
                <Input
                  id="litellm-master-key"
                  type="password"
                  value={masterKey}
                  onChange={(event) => setMasterKey(event.target.value)}
                  placeholder={data?.master_key_configured ? "Valor configurado — deixe vazio para manter" : "sk-..."}
                />
                <FieldDescription>
                  {data?.master_key_configured
                    ? `Configurada via ${data.master_key_source}`
                    : "Nenhuma master key configurada"}
                </FieldDescription>
              </Field>
            </div>

            {!data?.encryption_configured ? (
              <Alert className="border-red-900/50 bg-red-950/30 text-red-300">
                <KeyRound className="h-4 w-4" />
                <AlertTitle>Criptografia de segredos ausente</AlertTitle>
                <AlertDescription>
                  Configure PICOCLAW_SAAS_SECRETS_ENCRYPTION_KEY ou PICOCLAW_SAAS_MCP_ENCRYPTION_KEY para salvar a master key pelo painel.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => testM.mutate()}
                disabled={!configured || testM.isPending}
              >
                <CheckCircle className="h-4 w-4" />
                {testM.isPending ? "Testando..." : "Testar conexão"}
              </Button>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                <Save className="h-4 w-4" />
                {saveM.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
