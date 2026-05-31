import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, KeyRound, Plus, PlugZap, RefreshCw, Save, Trash2, XCircle } from "lucide-react";

import {
  createPlatformLiteLLMModel,
  deletePlatformLiteLLMModel,
  getPlatformLiteLLM,
  listPlatformLiteLLMModels,
  testPlatformLiteLLM,
  updatePlatformLiteLLM,
} from "@/api/platform-litellm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

// Main LiteLLM providers, with the canonical api_base each one expects. An
// empty apiBase means "leave api_base blank" — LiteLLM already knows the
// default endpoint for that provider, so forcing a base only risks drift.
// Order roughly by how often this product uses them.
const PROVIDER_OPTIONS: { value: string; label: string; apiBase: string }[] = [
  { value: "anthropic", label: "Anthropic", apiBase: "" },
  { value: "openai", label: "OpenAI", apiBase: "" },
  { value: "openrouter", label: "OpenRouter", apiBase: "https://openrouter.ai/api/v1" },
  { value: "gemini", label: "Google Gemini", apiBase: "" },
  { value: "groq", label: "Groq", apiBase: "https://api.groq.com/openai/v1" },
  { value: "mistral", label: "Mistral", apiBase: "https://api.mistral.ai/v1" },
  { value: "deepseek", label: "DeepSeek", apiBase: "https://api.deepseek.com" },
  { value: "xai", label: "xAI (Grok)", apiBase: "https://api.x.ai/v1" },
  { value: "together_ai", label: "Together AI", apiBase: "https://api.together.xyz/v1" },
  { value: "azure", label: "Azure OpenAI", apiBase: "" },
  { value: "ollama", label: "Ollama (local)", apiBase: "http://localhost:11434" },
];

// Distinct, non-empty api_base values offered as quick picks in the API base
// select (any base a provider can prefill must appear here so it renders).
const API_BASE_OPTIONS: string[] = Array.from(
  new Set(PROVIDER_OPTIONS.map((p) => p.apiBase).filter((b): b is string => b.length > 0)),
);

// Sentinels for the selects — Radix Select disallows empty-string item values,
// so "no value" and "custom" need explicit tokens.
const SELECT_NONE = "__none__";
const SELECT_CUSTOM = "__custom__";
const SELECT_DEFAULT_BASE = "__default__";

export function PlatformLiteLLM() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["platform-litellm"], queryFn: getPlatformLiteLLM });
  const [url, setURL] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [provider, setProvider] = useState("");
  const [providerCustom, setProviderCustom] = useState(false);
  const [apiBase, setAPIBase] = useState("");
  const [apiBaseCustom, setApiBaseCustom] = useState(false);
  const [apiVersion, setAPIVersion] = useState("");
  const [apiKey, setAPIKey] = useState("");

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
  const modelsQ = useQuery({
    queryKey: ["platform-litellm-models"],
    queryFn: listPlatformLiteLLMModels,
    enabled: configured,
  });

  const createModelM = useMutation({
    mutationFn: () =>
      createPlatformLiteLLMModel({
        model_name: modelName.trim(),
        model: providerModel.trim(),
        custom_llm_provider: provider.trim() || undefined,
        api_base: apiBase.trim() || undefined,
        api_version: apiVersion.trim() || undefined,
        api_key: apiKey.trim() || undefined,
      }),
    onSuccess: () => {
      setModelName("");
      setProviderModel("");
      setProvider("");
      setProviderCustom(false);
      setAPIBase("");
      setApiBaseCustom(false);
      setAPIVersion("");
      setAPIKey("");
      qc.invalidateQueries({ queryKey: ["platform-litellm-models"] });
      toast({ type: "success", message: "Modelo LiteLLM adicionado." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao adicionar modelo." }),
  });

  const deleteModelM = useMutation({
    mutationFn: (id: string) => deletePlatformLiteLLMModel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-litellm-models"] });
      toast({ type: "success", message: "Modelo LiteLLM removido." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao remover modelo." }),
  });
  const models = modelsQ.data?.models ?? [];

  const providerSelectValue = providerCustom
    ? SELECT_CUSTOM
    : provider
      ? provider
      : SELECT_NONE;

  function onProviderChange(value: string) {
    if (value === SELECT_CUSTOM) {
      setProviderCustom(true);
      return;
    }
    setProviderCustom(false);
    if (value === SELECT_NONE) {
      setProvider("");
      return;
    }
    setProvider(value);
    // Prefill the recommended api_base for the chosen provider (blank for
    // providers where LiteLLM already knows the endpoint). User can still
    // override via the API base select below.
    const preset = PROVIDER_OPTIONS.find((p) => p.value === value);
    setApiBaseCustom(false);
    setAPIBase(preset?.apiBase ?? "");
  }

  const apiBaseSelectValue = apiBaseCustom
    ? SELECT_CUSTOM
    : apiBase && API_BASE_OPTIONS.includes(apiBase)
      ? apiBase
      : SELECT_DEFAULT_BASE;

  function onApiBaseChange(value: string) {
    if (value === SELECT_CUSTOM) {
      setApiBaseCustom(true);
      return;
    }
    setApiBaseCustom(false);
    if (value === SELECT_DEFAULT_BASE) {
      setAPIBase("");
      return;
    }
    setAPIBase(value);
  }

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              Modelos e chaves upstream
            </CardTitle>
            <CardDescription>
              Adiciona entradas no LiteLLM usando /model/new. Chaves de provedores ficam no proxy, não no tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configured ? (
              <Alert className="border-zinc-800 bg-zinc-950/40">
                <AlertTitle>Configure a conexão primeiro</AlertTitle>
                <AlertDescription>Depois de salvar URL e master key, o painel carrega e altera o catálogo do LiteLLM.</AlertDescription>
              </Alert>
            ) : null}

            {modelsQ.isError ? (
              <Alert className="border-red-900/50 bg-red-950/30 text-red-300">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Falha ao carregar modelos</AlertTitle>
                <AlertDescription>{(modelsQ.error as { error?: string })?.error ?? "erro desconhecido"}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="litellm-model-name">Nome exposto no LiteLLM</FieldLabel>
                <Input
                  id="litellm-model-name"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="claude-sonnet-4-5"
                  disabled={!configured}
                />
                <FieldDescription>Este é o nome que tenants usam como modelo principal ou fallback.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-provider-model">Modelo upstream</FieldLabel>
                <Input
                  id="litellm-provider-model"
                  value={providerModel}
                  onChange={(event) => setProviderModel(event.target.value)}
                  placeholder="anthropic/claude-sonnet-4-5"
                  disabled={!configured}
                />
                <FieldDescription>Valor enviado em litellm_params.model.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-provider">Provider</FieldLabel>
                <Select
                  value={providerSelectValue}
                  onValueChange={onProviderChange}
                  disabled={!configured}
                >
                  <SelectTrigger id="litellm-provider">
                    <SelectValue placeholder="Selecione o provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>Não definir (padrão do LiteLLM)</SelectItem>
                    {PROVIDER_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={SELECT_CUSTOM}>Outro (personalizado)…</SelectItem>
                  </SelectContent>
                </Select>
                {providerCustom ? (
                  <Input
                    className="mt-2"
                    aria-label="Provider personalizado"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="ex.: bedrock, vertex_ai, cohere"
                    disabled={!configured}
                  />
                ) : null}
                <FieldDescription>
                  Mapeia para litellm_params.custom_llm_provider. Escolher um provedor
                  pré-preenche a API base recomendada.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-model-api-base">API base</FieldLabel>
                <Select
                  value={apiBaseSelectValue}
                  onValueChange={onApiBaseChange}
                  disabled={!configured}
                >
                  <SelectTrigger id="litellm-model-api-base">
                    <SelectValue placeholder="Padrão do provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_DEFAULT_BASE}>Padrão do provedor (em branco)</SelectItem>
                    {API_BASE_OPTIONS.map((base) => (
                      <SelectItem key={base} value={base}>
                        {base}
                      </SelectItem>
                    ))}
                    <SelectItem value={SELECT_CUSTOM}>Personalizado…</SelectItem>
                  </SelectContent>
                </Select>
                {apiBaseCustom ? (
                  <Input
                    className="mt-2"
                    aria-label="API base personalizada"
                    value={apiBase}
                    onChange={(event) => setAPIBase(event.target.value)}
                    placeholder="https://meu-proxy.exemplo.com/v1"
                    disabled={!configured}
                  />
                ) : null}
                <FieldDescription>
                  Opcional. Deixe no padrão para provedores nativos; informe a base
                  só em proxies/endpoints compatíveis.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-model-api-version">API version</FieldLabel>
                <Input
                  id="litellm-model-api-version"
                  value={apiVersion}
                  onChange={(event) => setAPIVersion(event.target.value)}
                  placeholder="Opcional, comum em Azure"
                  disabled={!configured}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="litellm-model-api-key">API key do provider</FieldLabel>
                <Input
                  id="litellm-model-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setAPIKey(event.target.value)}
                  placeholder="sk-... ou os.environ/NOME_DA_KEY"
                  disabled={!configured}
                />
                <FieldDescription>O LiteLLM não devolve o segredo na listagem.</FieldDescription>
              </Field>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => modelsQ.refetch()}
                disabled={!configured || modelsQ.isFetching}
              >
                <RefreshCw className="h-4 w-4" />
                {modelsQ.isFetching ? "Atualizando..." : "Atualizar lista"}
              </Button>
              <Button
                onClick={() => createModelM.mutate()}
                disabled={!configured || createModelM.isPending || !modelName.trim() || !providerModel.trim()}
              >
                <Plus className="h-4 w-4" />
                {createModelM.isPending ? "Adicionando..." : "Adicionar modelo"}
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900/80 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Upstream</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 text-right font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {modelsQ.isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">Carregando modelos...</td>
                    </tr>
                  ) : null}
                  {!modelsQ.isLoading && models.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">Nenhum modelo retornado pelo LiteLLM.</td>
                    </tr>
                  ) : null}
                  {models.map((model) => (
                    <tr key={model.id || `${model.model_name}:${model.model}`} className="hover:bg-zinc-900/40">
                      <td className="px-3 py-2 font-medium text-zinc-200">{model.model_name || "-"}</td>
                      <td className="px-3 py-2 text-zinc-400">{model.model || "-"}</td>
                      <td className="px-3 py-2 text-zinc-400">{model.provider || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge className="border-zinc-700 bg-zinc-900 text-zinc-300">
                          {model.db_model ? "DB" : "config"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!model.id || deleteModelM.isPending}
                          title={model.id ? "Remover modelo do LiteLLM" : "LiteLLM não retornou ID para remover"}
                          onClick={() => {
                            if (!model.id) return;
                            if (confirm(`Remover o modelo ${model.model_name || model.id} do LiteLLM?`)) {
                              deleteModelM.mutate(model.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
