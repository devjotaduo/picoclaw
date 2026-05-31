import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconExternalLink,
  IconLoader2,
  IconMessageCircle,
  IconShieldCheck,
  IconSparkles,
  IconUserCheck,
} from "@tabler/icons-react";

import {
  createTenant,
  getTenant,
  markPasswordDelivered,
  type CreateTenantInput,
  type CreateTenantResponse,
  type TenantCLIProvider,
  type TenantModelRoutingMode,
  type TenantType,
} from "@/api/tenants";
import { listWorkspaces } from "@/api/workspaces";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyableField } from "@/components/ui/copyable-field";
import { Dialog } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CLAUDE_CLI_MODEL_PRESETS,
  CODEX_CLI_MODEL_PRESETS,
  CUSTOM_CLI_MODEL_PRESET_ID,
  cliModelValueFromPreset,
  cliPresetDescription,
  splitModelList,
} from "@/lib/model-routing";
import { cn } from "@/lib/utils";

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateSubdomain(value: string): string | null {
  if (!value) return "Informe o endereço curto.";
  if (value.length < 3 || value.length > 30) return "Use de 3 a 30 caracteres.";
  if (!SUBDOMAIN_RE.test(value)) return "Use apenas letras minúsculas, números e hífen.";
  return null;
}

interface TypeCard {
  id: TenantType;
  title: string;
  tagline: string;
  bullets: string[];
  subdomainHint: string;
  displayNameHint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TYPE_CARDS: TypeCard[] = [
  {
    id: "cliente",
    title: "Cliente",
    tagline: "Cliente com área própria e responsável definido",
    bullets: ["Link curto de acesso + senha como alternativa", "Atendimento, canais e configurações básicas", "Sem ferramentas internas da Jota Duo"],
    subdomainHint: "acme",
    displayNameHint: "Acme Corp",
    icon: IconUserCheck,
  },
  {
    id: "admin",
    title: "Equipe Jota Duo",
    tagline: "Área interna para gestão da operação",
    bullets: ["Link curto de acesso", "Menu completo da equipe", "Habilidades, registros e configurações visíveis"],
    subdomainHint: "ops",
    displayNameHint: "Operações",
    icon: IconShieldCheck,
  },
  {
    id: "publico",
    title: "Público",
    tagline: "Atendimento aberto, sem senha",
    bullets: ["Visitante entra direto no chat", "Ideal para descoberta guiada com Sofia", "Entrega endereço público, sem pacote interno"],
    subdomainHint: "onboarding",
    displayNameHint: "Onboarding",
    icon: IconMessageCircle,
  },
];

function selectedTypeMeta(type: TenantType) {
  return TYPE_CARDS.find((card) => card.id === type) ?? TYPE_CARDS[0];
}

function parseTenantTypeParam(value: string | null): TenantType | null {
  return value === "publico" || value === "admin" || value === "cliente" ? value : null;
}

type CLIOrderPreset = "claude-codex" | "codex-claude" | "claude" | "codex";

function cliOrderFromPreset(value: CLIOrderPreset): TenantCLIProvider[] {
  switch (value) {
    case "codex-claude":
      return ["codex-cli", "claude-cli"];
    case "claude":
      return ["claude-cli"];
    case "codex":
      return ["codex-cli"];
    default:
      return ["claude-cli", "codex-cli"];
  }
}

export function NewTenant() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const initialTenantType =
    parseTenantTypeParam(searchParams.get("type")) ??
    parseTenantTypeParam(searchParams.get("tenant_type")) ??
    "cliente";
  const [tenantType, setTenantType] = useState<TenantType>(initialTenantType);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelRoutingMode, setModelRoutingMode] = useState<TenantModelRoutingMode>("auto");
  const [litellmModelName, setLiteLLMModelName] = useState("gpt-4o-mini");
  const [litellmAPIBase, setLiteLLMAPIBase] = useState("");
  const [litellmFallbacks, setLiteLLMFallbacks] = useState("");
  const [litellmAllowedModels, setLiteLLMAllowedModels] = useState("");
  const [cliOrderPreset, setCLIOrderPreset] = useState<CLIOrderPreset>("claude-codex");
  const [claudeCLIModelPreset, setClaudeCLIModelPreset] = useState("sonnet");
  const [claudeCLICustomModel, setClaudeCLICustomModel] = useState("");
  const [codexCLIModelPreset, setCodexCLIModelPreset] = useState("codex-cli");
  const [codexCLICustomModel, setCodexCLICustomModel] = useState("");
  const [form, setForm] = useState<CreateTenantInput>({
    display_name: "",
    owner_email: "",
    subdomain: "",
    workspace_id: "",
    monthly_budget_usd: 5,
    mem_limit_mb: 512,
    cpu_quota: 0.5,
  });
  const [result, setResult] = useState<CreateTenantResponse | null>(null);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const subdomainRef = useRef<HTMLInputElement>(null);

  const workspacesQ = useQuery({
    queryKey: ["workspaces", "manual"],
    queryFn: () => listWorkspaces({ manualOnly: true }),
  });
  const workspaces = workspacesQ.data?.workspaces ?? [];
  const defaultWorkspace = workspaces.find((ws) => ws.is_default_auto);

  useEffect(() => {
    if (!form.workspace_id && defaultWorkspace) {
      setForm((prev) => ({ ...prev, workspace_id: defaultWorkspace.id }));
    }
  }, [defaultWorkspace, form.workspace_id]);

  const m = useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["tenant-status", result?.tenant_id],
    queryFn: () => getTenant(result!.tenant_id),
    enabled: !!result,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "provisioning" || s === undefined ? 2000 : false;
    },
  });

  const card = selectedTypeMeta(tenantType);
  const needsOwnerEmail = tenantType !== "publico";
  const tenantStatus = statusQuery.data?.status;
  const isProvisioning = !tenantStatus || tenantStatus === "provisioning";
  const hasError = tenantStatus === "error";

  const selectedWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === form.workspace_id),
    [form.workspace_id, workspaces],
  );

  const errPayload = (() => {
    const e = m.error as unknown;
    if (!e || typeof e !== "object") return null;
    return e as {
      error?: string;
      status?: number;
      body?: { tenant_id?: string; url?: string };
    };
  })();
  const errMsg = errPayload?.error ?? (m.error ? "request failed" : null);
  const duplicateTenant =
    errPayload && errPayload.status === 409 && errPayload.body?.tenant_id
      ? {
          tenantId: errPayload.body.tenant_id,
          url: errPayload.body.url,
        }
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateSubdomain(form.subdomain);
    if (err) {
      setSubdomainError(err);
      subdomainRef.current?.focus();
      return;
    }
    const claudeCLIModel = cliModelValueFromPreset(
      claudeCLIModelPreset,
      claudeCLICustomModel,
      CLAUDE_CLI_MODEL_PRESETS,
    );
    const codexCLIModel = cliModelValueFromPreset(
      codexCLIModelPreset,
      codexCLICustomModel,
      CODEX_CLI_MODEL_PRESETS,
    );
    const modelRouting: CreateTenantInput["model_routing"] =
      modelRoutingMode === "litellm"
        ? {
            mode: "litellm",
            litellm: {
              model_name: litellmModelName.trim() || undefined,
              api_base: litellmAPIBase.trim() || undefined,
              fallbacks: splitModelList(litellmFallbacks),
              allowed_models: splitModelList(litellmAllowedModels),
            },
          }
        : modelRoutingMode === "cli"
          ? {
              mode: "cli",
              cli: {
                order: cliOrderFromPreset(cliOrderPreset),
                claude_model: claudeCLIModel.trim() || undefined,
                codex_model: codexCLIModel.trim() || undefined,
              },
            }
          : { mode: "auto" };
    m.mutate({
      ...form,
      tenant_type: tenantType,
      owner_email: needsOwnerEmail ? form.owner_email : "",
      model_routing: modelRouting,
    });
  };

  const markDelivered = async () => {
    if (!result) return;
    await markPasswordDelivered(result.tenant_id);
    nav(`/tenants/${result.tenant_id}`);
  };

  const accessLink = result?.access_link ?? result?.short_magic_link ?? result?.magic_link;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Novo cliente"
        description="Crie a área do cliente com modelo base, preparação automática e pacote de acesso no mesmo fluxo."
      >
        <Button variant="outline" asChild>
          <Link to="/tenants">Cancelar</Link>
        </Button>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 lg:p-6">
        <div className="grid gap-3 lg:grid-cols-3">
          {TYPE_CARDS.map((type) => {
            const Icon = type.icon;
            const selected = tenantType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setTenantType(type.id)}
                className={cn(
                  "flex min-h-44 flex-col gap-4 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs transition hover:bg-accent/40",
                  selected ? "border-primary ring-2 ring-primary/20" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <div className="font-medium">{type.title}</div>
                      <div className="text-xs text-muted-foreground">{type.tagline}</div>
                    </div>
                  </div>
                  {selected ? <Badge className="border-primary/30 bg-primary/10 text-primary">Selecionado</Badge> : null}
                </div>
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {type.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-2 size-1 rounded-full bg-muted-foreground/50" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Criar cliente — {card.title}</CardTitle>
            <CardDescription>
              {needsOwnerEmail
                ? "Ao concluir, o responsável recebe o link curto de acesso e a senha inicial como alternativa."
                : "O atendimento público não gera responsável, senha ou link interno automático."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-5">
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="display_name">Nome do cliente</FieldLabel>
                    <Input
                      id="display_name"
                      required
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder={card.displayNameHint}
                    />
                  </Field>

                  {needsOwnerEmail ? (
                    <Field>
                      <FieldLabel htmlFor="owner_email">Email do responsável</FieldLabel>
                      <Input
                        id="owner_email"
                        type="email"
                        required
                        value={form.owner_email}
                        onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                        placeholder="responsavel@empresa.com"
                      />
                      <FieldDescription>Recebe acesso como responsável pela área.</FieldDescription>
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel>Responsável</FieldLabel>
                      <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                        Não se aplica ao atendimento público
                      </div>
                    </Field>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                  <Field data-invalid={Boolean(subdomainError)}>
                    <FieldLabel htmlFor="subdomain">Endereço curto</FieldLabel>
                    <Input
                      id="subdomain"
                      ref={subdomainRef}
                      required
                      maxLength={30}
                      value={form.subdomain}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase();
                        setForm({ ...form, subdomain: v });
                        setSubdomainError(validateSubdomain(v));
                      }}
                      onBlur={() => setSubdomainError(validateSubdomain(form.subdomain))}
                      aria-invalid={Boolean(subdomainError)}
                      placeholder={card.subdomainHint}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <FieldDescription>
                      {subdomainError ?? "3 a 30 caracteres: letras minúsculas, números e hífen."}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>Modelo base</FieldLabel>
                    {workspaces.length === 0 ? (
                      <Alert className="border-chart-3/40 bg-chart-3/10">
                        <AlertTitle>Nenhum modelo base disponível</AlertTitle>
                        <AlertDescription>
                          Crie um modelo base antes de criar clientes.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        <Select
                          value={form.workspace_id}
                          onValueChange={(value) => setForm({ ...form, workspace_id: value })}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha um modelo base" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {workspaces.map((ws) => (
                                <SelectItem key={ws.id} value={ws.id}>
                                  {ws.name} · v{ws.version}
                                  {ws.is_default_auto ? " (padrão)" : ""}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          {selectedWorkspace
                            ? `${selectedWorkspace.name} aplica agentes, habilidades e telas prontas.`
                            : "Modelo inicial da área do cliente."}
                        </FieldDescription>
                      </>
                    )}
                  </Field>
                </div>
              </FieldGroup>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-fit">
                    Ajustes avançados
                    <IconChevronDown className={cn("transition-transform", advancedOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="budget">Limite mensal (USD)</FieldLabel>
                        <Input
                          id="budget"
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.monthly_budget_usd ?? ""}
                          onChange={(e) => setForm({ ...form, monthly_budget_usd: e.target.value === "" ? undefined : Number(e.target.value) })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="mem">Memória MB</FieldLabel>
                        <Input
                          id="mem"
                          type="number"
                          min="128"
                          max="8192"
                          value={form.mem_limit_mb ?? 512}
                          onChange={(e) => setForm({ ...form, mem_limit_mb: Number(e.target.value) })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="cpu">Uso de CPU</FieldLabel>
                        <Input
                          id="cpu"
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="8"
                          value={form.cpu_quota ?? 0.5}
                          onChange={(e) => setForm({ ...form, cpu_quota: Number(e.target.value) })}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
                      <Field>
                        <FieldLabel>Roteamento de modelo</FieldLabel>
                        <Select
                          value={modelRoutingMode}
                          onValueChange={(value) => setModelRoutingMode(value as TenantModelRoutingMode)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Automático</SelectItem>
                            <SelectItem value="litellm">LiteLLM</SelectItem>
                            <SelectItem value="cli">CLIs compartilhados</SelectItem>
                          </SelectContent>
                        </Select>
                        <FieldDescription>Define a origem da chave e a cadeia principal do tenant.</FieldDescription>
                      </Field>

                      {modelRoutingMode === "cli" ? (
                        <>
                          <Field>
                            <FieldLabel>Ordem dos CLIs</FieldLabel>
                            <Select
                              value={cliOrderPreset}
                              onValueChange={(value) => setCLIOrderPreset(value as CLIOrderPreset)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="claude-codex">Claude CLI → Codex CLI</SelectItem>
                                <SelectItem value="codex-claude">Codex CLI → Claude CLI</SelectItem>
                                <SelectItem value="claude">Somente Claude CLI</SelectItem>
                                <SelectItem value="codex">Somente Codex CLI</SelectItem>
                              </SelectContent>
                            </Select>
                            <FieldDescription>O backend valida se o auth escolhido existe no host.</FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="claude-cli-model">Modelo Claude CLI</FieldLabel>
                            <Select
                              value={claudeCLIModelPreset}
                              onValueChange={setClaudeCLIModelPreset}
                            >
                              <SelectTrigger id="claude-cli-model">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CLAUDE_CLI_MODEL_PRESETS.map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label} · {preset.model}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>Personalizado</SelectItem>
                              </SelectContent>
                            </Select>
                            {claudeCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID ? (
                              <Input
                                id="claude-cli-custom-model"
                                value={claudeCLICustomModel}
                                onChange={(e) => setClaudeCLICustomModel(e.target.value)}
                                placeholder="claude-sonnet-4-6"
                              />
                            ) : null}
                            <FieldDescription>
                              {cliPresetDescription(claudeCLIModelPreset, CLAUDE_CLI_MODEL_PRESETS)}
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="codex-cli-model">Modelo Codex CLI</FieldLabel>
                            <Select
                              value={codexCLIModelPreset}
                              onValueChange={setCodexCLIModelPreset}
                            >
                              <SelectTrigger id="codex-cli-model">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CODEX_CLI_MODEL_PRESETS.map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label} · {preset.model}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>Personalizado</SelectItem>
                              </SelectContent>
                            </Select>
                            {codexCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID ? (
                              <Input
                                id="codex-cli-custom-model"
                                value={codexCLICustomModel}
                                onChange={(e) => setCodexCLICustomModel(e.target.value)}
                                placeholder="gpt-5.5"
                              />
                            ) : null}
                            <FieldDescription>
                              {cliPresetDescription(codexCLIModelPreset, CODEX_CLI_MODEL_PRESETS)}
                            </FieldDescription>
                          </Field>
                        </>
                      ) : null}

                      {modelRoutingMode === "litellm" ? (
                        <>
                          <Field>
                            <FieldLabel htmlFor="litellm-model">Modelo principal LiteLLM</FieldLabel>
                            <Input
                              id="litellm-model"
                              value={litellmModelName}
                              onChange={(e) => setLiteLLMModelName(e.target.value)}
                              placeholder="gpt-4o-mini"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="litellm-api-base">API base no tenant</FieldLabel>
                            <Input
                              id="litellm-api-base"
                              value={litellmAPIBase}
                              onChange={(e) => setLiteLLMAPIBase(e.target.value)}
                              placeholder="Usar LITELLM_URL"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="litellm-fallbacks">Fallbacks</FieldLabel>
                            <Textarea
                              id="litellm-fallbacks"
                              value={litellmFallbacks}
                              onChange={(e) => setLiteLLMFallbacks(e.target.value)}
                              placeholder={"claude-haiku-4-5\ndeepseek-chat"}
                            />
                            <FieldDescription>Um por linha, na ordem de tentativa.</FieldDescription>
                          </Field>
                          <Field className="md:col-span-2">
                            <FieldLabel htmlFor="litellm-allowed">Modelos liberados na chave</FieldLabel>
                            <Textarea
                              id="litellm-allowed"
                              value={litellmAllowedModels}
                              onChange={(e) => setLiteLLMAllowedModels(e.target.value)}
                              placeholder="Vazio = principal + fallbacks"
                            />
                          </Field>
                        </>
                      ) : null}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {errMsg ? (
                <Alert className="border-destructive/40 bg-destructive/10">
                  <AlertTitle>Falha ao criar cliente</AlertTitle>
                  <AlertDescription>
                    <div>{errMsg}</div>
                    {duplicateTenant ? (
                      <div className="mt-2">
                        Cliente existente:{" "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => nav(`/tenants/${duplicateTenant.tenantId}`)}
                        >
                          {duplicateTenant.tenantId}
                        </button>
                        {duplicateTenant.url ? (
                          <>
                            {" · "}
                            <a href={duplicateTenant.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                              {duplicateTenant.url}
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => nav("/tenants")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={m.isPending || workspaces.length === 0}>
                  {m.isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : <IconSparkles data-icon="inline-start" />}
                  {m.isPending ? "Preparando..." : "Criar cliente"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!result} onClose={markDelivered} title="Cliente pronto" size="lg">
        {result ? (
          <div className="flex flex-col gap-4 text-sm">
            {result.warning || result.access_warning ? (
              <Alert className="border-chart-3/40 bg-chart-3/10">
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>{result.access_warning ?? result.warning}</AlertDescription>
              </Alert>
            ) : null}

            {isProvisioning ? (
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <IconLoader2 className="size-4 animate-spin" />
                  Área do cliente iniciando
                </AlertTitle>
                <AlertDescription>O acesso já foi gerado; aguarde a área ficar ativa antes de abrir.</AlertDescription>
              </Alert>
            ) : null}
            {hasError ? (
              <Alert className="border-destructive/40 bg-destructive/10">
                <AlertTitle>Erro ao preparar a área</AlertTitle>
                <AlertDescription>{statusQuery.data?.last_error ?? "Verifique os logs do servidor."}</AlertDescription>
              </Alert>
            ) : null}

            {accessLink ? (
              <CopyableField
                label="Link de acesso recomendado"
                value={accessLink}
                accent="emerald"
                variant="tight"
                hint="Use este link para enviar ao responsável. O link curto é preferido quando disponível."
              />
            ) : needsOwnerEmail ? (
              <Empty className="p-5">
                <EmptyTitle>Pacote sem link de acesso</EmptyTitle>
                <EmptyDescription>Use endereço, email e senha inicial abaixo como alternativa.</EmptyDescription>
              </Empty>
            ) : null}

            <CopyableField label="Endereço da área" value={result.url} variant="tight" />
            {needsOwnerEmail && form.owner_email ? (
              <CopyableField label="Email do responsável" value={form.owner_email} />
            ) : null}
            {result.initial_password ? (
              <CopyableField
                label="Senha inicial"
                value={result.initial_password}
                warning="Guarde agora: a senha não será exibida novamente."
              />
            ) : null}
            {result.magic_link && result.magic_link !== accessLink ? (
              <CopyableField label="Link de acesso completo" value={result.magic_link} variant="tight" />
            ) : null}
            {result.info ? (
              <Alert className="border-chart-2/30 bg-chart-2/10">
                <AlertDescription>{result.info}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setResult(null)}>
                Fechar
              </Button>
              <Button variant="outline" asChild>
                <a href={result.url} target="_blank" rel="noreferrer">
                  Abrir área
                  <IconExternalLink data-icon="inline-end" />
                </a>
              </Button>
              <Button onClick={markDelivered} disabled={isProvisioning}>
                {isProvisioning ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
                {isProvisioning ? "Preparando..." : "Abrir cliente no painel"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
