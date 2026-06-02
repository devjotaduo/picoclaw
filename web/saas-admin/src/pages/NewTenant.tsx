import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconLoader2,
  IconLock,
  IconSparkles,
} from "@tabler/icons-react";

import {
  createTenant,
  getTenantReadiness,
  markPasswordDelivered,
  type CreateTenantInput,
  type CreateTenantResponse,
  type TenantCLIProvider,
  type TenantModelRoutingMode,
} from "@/api/tenants";
import { listPlatformLiteLLMModels } from "@/api/platform-litellm";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyableField } from "@/components/ui/copyable-field";
import { Dialog } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LiteLLMModelMultiSelect, LiteLLMModelSelect } from "@/components/tenant/litellm-model-picker";
import {
  CLAUDE_CLI_MODEL_PRESETS,
  CODEX_CLI_MODEL_PRESETS,
  CUSTOM_CLI_MODEL_PRESET_ID,
  DEFAULT_LITELLM_FALLBACKS,
  DEFAULT_LITELLM_MODEL_NAME,
  cliModelValueFromPreset,
  cliPresetDescription,
  normalizeModelList,
  removeModelName,
} from "@/lib/model-routing";
import { cn } from "@/lib/utils";

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateSubdomain(value: string): string | null {
  if (!value) return "Informe o endereço curto.";
  if (value.length < 3 || value.length > 30) return "Use de 3 a 30 caracteres.";
  if (!SUBDOMAIN_RE.test(value)) return "Use apenas letras minúsculas, números e hífen.";
  return null;
}

type TenantType = "cliente" | "admin" | "publico";

const TENANT_TYPES: { id: TenantType; label: string; hint: { subdomain: string; name: string } }[] = [
  { id: "cliente", label: "Cliente", hint: { subdomain: "acme", name: "Acme Corp" } },
  { id: "admin", label: "Equipe Jota Duo", hint: { subdomain: "ops", name: "Operações" } },
  { id: "publico", label: "Público", hint: { subdomain: "onboarding", name: "Onboarding" } },
];

const AGENT_CATEGORIES = [
  {
    label: "Atendimento",
    agents: [
      { id: "clara", label: "Clara", description: "Atendente principal" },
      { id: "luna", label: "Luna", description: "Atendente noturna" },
    ],
  },
  {
    label: "Vendas & Suporte",
    agents: [
      { id: "marcos", label: "Marcos", description: "Consultor de vendas" },
      { id: "camila", label: "Camila", description: "Suporte e pós-venda" },
    ],
  },
  {
    label: "Criação",
    agents: [
      { id: "lia", label: "Lia", description: "Marketing digital" },
      { id: "pixel", label: "Pixel", description: "Geração de imagens" },
      { id: "doc", label: "Doc", description: "Geração de documentos" },
    ],
  },
  {
    label: "Especialistas",
    agents: [
      { id: "sofia", label: "Sofia", description: "Discovery e onboarding" },
      { id: "catarina", label: "Catarina", description: "Curadoria via WhatsApp" },
    ],
  },
];

const ALL_AGENTS = AGENT_CATEGORIES.flatMap((c) => c.agents);

type CLIOrderPreset = "claude-codex" | "codex-claude" | "claude" | "codex";

function cliOrderFromPreset(value: CLIOrderPreset): TenantCLIProvider[] {
  switch (value) {
    case "codex-claude": return ["codex-cli", "claude-cli"];
    case "claude": return ["claude-cli"];
    case "codex": return ["codex-cli"];
    default: return ["claude-cli", "codex-cli"];
  }
}

function parseTenantTypeParam(value: string | null): TenantType | null {
  return value === "publico" || value === "admin" || value === "cliente" ? value : null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NewTenant() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const initialType =
    parseTenantTypeParam(searchParams.get("type")) ??
    parseTenantTypeParam(searchParams.get("tenant_type")) ??
    "cliente";

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [tenantType, setTenantType] = useState<TenantType>(initialType);
  const [displayName, setDisplayName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const subdomainRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Step 3 — advanced (collapsed by default)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(10);
  const [memLimit, setMemLimit] = useState(512);
  const [cpuQuota, setCpuQuota] = useState(0.5);
  const [modelRoutingMode, setModelRoutingMode] = useState<TenantModelRoutingMode>("auto");
  const [litellmModelName, setLiteLLMModelName] = useState(DEFAULT_LITELLM_MODEL_NAME);
  const [litellmAPIBase, setLiteLLMAPIBase] = useState("");
  const [litellmFallbacks, setLiteLLMFallbacks] = useState<string[]>([...DEFAULT_LITELLM_FALLBACKS]);
  const [litellmAllowedModels, setLiteLLMAllowedModels] = useState<string[]>([]);
  const [cliOrderPreset, setCLIOrderPreset] = useState<CLIOrderPreset>("claude-codex");
  const [claudeCLIModelPreset, setClaudeCLIModelPreset] = useState("sonnet");
  const [claudeCLICustomModel, setClaudeCLICustomModel] = useState("");
  const [codexCLIModelPreset, setCodexCLIModelPreset] = useState("codex-cli");
  const [codexCLICustomModel, setCodexCLICustomModel] = useState("");

  const [result, setResult] = useState<CreateTenantResponse | null>(null);

  const litellmModelsQ = useQuery({
    queryKey: ["platform-litellm-models"],
    queryFn: listPlatformLiteLLMModels,
    enabled: advancedOpen && modelRoutingMode === "litellm",
    staleTime: 30_000,
    retry: false,
  });
  const litellmModels = litellmModelsQ.data?.models ?? [];

  const m = useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  const readinessQuery = useQuery({
    queryKey: ["tenant-readiness", result?.tenant_id],
    queryFn: () => getTenantReadiness(result!.tenant_id),
    enabled: !!result,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return !data.ready && data.status !== "error" ? 2000 : false;
    },
  });

  // ── Derived
  const needsOwnerEmail = tenantType !== "publico";
  const tenantStatus = readinessQuery.data?.status;
  const hasError = tenantStatus === "error";
  const canReleaseAccess = !!result && readinessQuery.data?.ready === true && !hasError;
  const isProvisioning = !!result && !canReleaseAccess && !hasError;
  const readinessError =
    readinessQuery.data?.last_error ??
    readinessQuery.data?.error ??
    (readinessQuery.isError ? "Não foi possível verificar o subdomínio agora." : null);
  const errPayload = (() => {
    const e = m.error as unknown;
    if (!e || typeof e !== "object") return null;
    return e as { error?: string; status?: number; body?: { tenant_id?: string; url?: string } };
  })();
  const errMsg = errPayload?.error ?? (m.error ? "request failed" : null);
  const duplicateTenant =
    errPayload?.status === 409 && errPayload.body?.tenant_id
      ? { tenantId: errPayload.body.tenant_id, url: errPayload.body.url }
      : null;
  const typeHint = TENANT_TYPES.find((t) => t.id === tenantType)?.hint ?? TENANT_TYPES[0].hint;
  const accessLink = result?.access_link ?? result?.short_magic_link ?? result?.magic_link;
  const dialogTitle = hasError
    ? "Erro ao preparar cliente"
    : canReleaseAccess
      ? "Cliente pronto"
      : "Preparando cliente";

  // ── Navigation
  const goToStep2 = () => {
    const sdErr = validateSubdomain(subdomain);
    if (sdErr) {
      setSubdomainError(sdErr);
      subdomainRef.current?.focus();
      return;
    }
    if (!displayName.trim()) return;
    if (needsOwnerEmail && !ownerEmail.trim()) return;
    setStep(2);
  };

  const toggleAgent = (id: string) =>
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );

  const submit = () => {
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
              fallbacks: normalizeModelList(litellmFallbacks),
              allowed_models: normalizeModelList(litellmAllowedModels),
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
      display_name: displayName.trim(),
      owner_email: needsOwnerEmail ? ownerEmail.trim() : "",
      subdomain,
      tenant_type: tenantType,
      selected_agents: ["main", ...selectedAgents.filter((a) => a !== "main")],
      monthly_budget_usd: monthlyBudget,
      mem_limit_mb: memLimit,
      cpu_quota: cpuQuota,
      model_routing: modelRouting,
    });
  };

  const markDelivered = async () => {
    if (!result || !canReleaseAccess) return;
    await markPasswordDelivered(result.tenant_id);
    nav(`/tenants/${result.tenant_id}`);
  };

  const closeResultDialog = () => {
    if (isProvisioning) return;
    setResult(null);
  };

  const STEPS = ["Info", "Agentes", "Revisar"];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Novo cliente"
        description="Preencha as 3 etapas para criar a área do cliente."
      >
        <Button variant="outline" asChild>
          <Link to="/tenants">Cancelar</Link>
        </Button>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 lg:p-6">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "ring-primary/30 bg-primary/20 text-primary ring-2"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </div>
                <span
                  className={cn(
                    "text-sm",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-px w-8 bg-border", done && "bg-primary")} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Tipo + Info ─────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardContent className="flex flex-col gap-5 pt-6">
              <Field>
                <FieldLabel>Tipo de tenant</FieldLabel>
                <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                  {TENANT_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTenantType(t.id)}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                        tenantType === t.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {tenantType === "publico" && (
                  <FieldDescription>
                    Tenant de onboarding público — Sofia será a agente ativa. Sem responsável.
                  </FieldDescription>
                )}
              </Field>

              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="display_name">Nome da empresa</FieldLabel>
                    <Input
                      id="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={typeHint.name}
                    />
                  </Field>

                  {needsOwnerEmail ? (
                    <Field>
                      <FieldLabel htmlFor="owner_email">Email do responsável</FieldLabel>
                      <Input
                        id="owner_email"
                        type="email"
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder="responsavel@empresa.com"
                      />
                    </Field>
                  ) : null}

                  <Field
                    data-invalid={Boolean(subdomainError)}
                    className={cn(!needsOwnerEmail && "sm:col-span-2")}
                  >
                    <FieldLabel htmlFor="subdomain">Endereço curto</FieldLabel>
                    <Input
                      id="subdomain"
                      ref={subdomainRef}
                      value={subdomain}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase();
                        setSubdomain(v);
                        setSubdomainError(validateSubdomain(v));
                      }}
                      onBlur={() => setSubdomainError(validateSubdomain(subdomain))}
                      placeholder={typeHint.subdomain}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={30}
                      aria-invalid={Boolean(subdomainError)}
                    />
                    <FieldDescription>
                      {subdomainError ? (
                        <span className="text-destructive">{subdomainError}</span>
                      ) : subdomain ? (
                        `${subdomain}.jotaduo.com`
                      ) : (
                        "3–30 chars: letras minúsculas, números e hífen."
                      )}
                    </FieldDescription>
                  </Field>
                </div>
              </FieldGroup>

              <div className="flex justify-end border-t pt-4">
                <Button
                  type="button"
                  onClick={goToStep2}
                  disabled={
                    !displayName.trim() ||
                    (needsOwnerEmail && !ownerEmail.trim()) ||
                    Boolean(subdomainError) ||
                    !subdomain
                  }
                >
                  Agentes
                  <IconChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Agentes ─────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {/* Rafael — always on */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🧠</span>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      Rafael
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        padrão
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">Orquestrador principal</div>
                  </div>
                </div>
                <IconLock className="size-4 text-muted-foreground/40" />
              </div>

              {tenantType === "publico" ? (
                /* Public tenants have Sofia forced by the provisioner */
                <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔍</span>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        Sofia
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          onboarding público
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Agente de discovery — ativa automaticamente em tenants públicos
                      </div>
                    </div>
                  </div>
                  <IconLock className="size-4 text-muted-foreground/40" />
                </div>
              ) : (
                AGENT_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="flex flex-col gap-1.5">
                    <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {cat.label}
                    </div>
                    {cat.agents.map((agent) => {
                      const active = selectedAgents.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleAgent(agent.id)}
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
                            active
                              ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                              : "bg-card hover:bg-muted/30",
                          )}
                        >
                          <div className="text-sm">
                            <span className="font-medium">{agent.label}</span>
                            <span className="ml-2 text-muted-foreground">
                              — {agent.description}
                            </span>
                          </div>
                          {/* CSS toggle */}
                          <div
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-colors",
                              active ? "bg-primary" : "bg-muted",
                            )}
                          >
                            <div
                              className={cn(
                                "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                                active ? "left-4" : "left-0.5",
                              )}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}

              <div className="flex justify-between border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Revisar
                  <IconChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Revisão + Criar ──────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardContent className="flex flex-col gap-5 pt-6">
              {/* Summary */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Resumo
                </div>
                <SummaryRow
                  label="Tipo"
                  value={TENANT_TYPES.find((t) => t.id === tenantType)?.label ?? tenantType}
                />
                <SummaryRow label="Nome" value={displayName} />
                {needsOwnerEmail && <SummaryRow label="Email" value={ownerEmail} />}
                <SummaryRow label="Subdomínio" value={`${subdomain}.jotaduo.com`} accent />
                <SummaryRow
                  label="Agentes"
                  value={[
                    "Rafael",
                    ...ALL_AGENTS.filter((a) => selectedAgents.includes(a.id)).map(
                      (a) => a.label,
                    ),
                  ].join(" · ")}
                />
              </div>

              {/* Advanced */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-fit text-muted-foreground hover:text-foreground"
                  >
                    Configurações avançadas
                    <IconChevronDown
                      className={cn("ml-1 size-4 transition-transform", advancedOpen && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="budget">Limite mensal (USD)</FieldLabel>
                        <Input
                          id="budget"
                          type="number"
                          step="0.01"
                          min="0"
                          value={monthlyBudget}
                          onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="mem">Memória MB</FieldLabel>
                        <Input
                          id="mem"
                          type="number"
                          min="128"
                          max="8192"
                          value={memLimit}
                          onChange={(e) => setMemLimit(Number(e.target.value))}
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
                          value={cpuQuota}
                          onChange={(e) => setCpuQuota(Number(e.target.value))}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                      <Field>
                        <FieldLabel>Roteamento de modelo</FieldLabel>
                        <Select
                          value={modelRoutingMode}
                          onValueChange={(v) =>
                            setModelRoutingMode(v as TenantModelRoutingMode)
                          }
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
                        <FieldDescription>
                          Define a origem da chave e a cadeia principal do tenant.
                        </FieldDescription>
                      </Field>

                      {modelRoutingMode === "cli" ? (
                        <>
                          <Field>
                            <FieldLabel>Ordem dos CLIs</FieldLabel>
                            <Select
                              value={cliOrderPreset}
                              onValueChange={(v) => setCLIOrderPreset(v as CLIOrderPreset)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="claude-codex">
                                  Claude CLI → Codex CLI
                                </SelectItem>
                                <SelectItem value="codex-claude">
                                  Codex CLI → Claude CLI
                                </SelectItem>
                                <SelectItem value="claude">Somente Claude CLI</SelectItem>
                                <SelectItem value="codex">Somente Codex CLI</SelectItem>
                              </SelectContent>
                            </Select>
                            <FieldDescription>
                              O backend valida se o auth escolhido existe no host.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel>Modelo Claude CLI</FieldLabel>
                            <Select
                              value={claudeCLIModelPreset}
                              onValueChange={setClaudeCLIModelPreset}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CLAUDE_CLI_MODEL_PRESETS.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.label} · {p.model}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>
                                  Personalizado
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {claudeCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID && (
                              <Input
                                value={claudeCLICustomModel}
                                onChange={(e) => setClaudeCLICustomModel(e.target.value)}
                                placeholder="claude-sonnet-4-6"
                              />
                            )}
                            <FieldDescription>
                              {cliPresetDescription(
                                claudeCLIModelPreset,
                                CLAUDE_CLI_MODEL_PRESETS,
                              )}
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel>Modelo Codex CLI</FieldLabel>
                            <Select
                              value={codexCLIModelPreset}
                              onValueChange={setCodexCLIModelPreset}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CODEX_CLI_MODEL_PRESETS.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.label} · {p.model}
                                  </SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_CLI_MODEL_PRESET_ID}>
                                  Personalizado
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {codexCLIModelPreset === CUSTOM_CLI_MODEL_PRESET_ID && (
                              <Input
                                value={codexCLICustomModel}
                                onChange={(e) => setCodexCLICustomModel(e.target.value)}
                                placeholder="gpt-5.5"
                              />
                            )}
                            <FieldDescription>
                              {cliPresetDescription(
                                codexCLIModelPreset,
                                CODEX_CLI_MODEL_PRESETS,
                              )}
                            </FieldDescription>
                          </Field>
                        </>
                      ) : null}

                      {modelRoutingMode === "litellm" ? (
                        <>
                          {litellmModelsQ.isError ? (
                            <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive sm:col-span-3">
                              {(litellmModelsQ.error as { error?: string })?.error ??
                                "Falha ao carregar modelos cadastrados no LiteLLM."}
                            </div>
                          ) : null}
                          <Field>
                            <FieldLabel>Modelo principal LiteLLM</FieldLabel>
                            <LiteLLMModelSelect
                              value={litellmModelName}
                              onChange={(next) => {
                                setLiteLLMModelName(next);
                                setLiteLLMFallbacks((cur) => removeModelName(cur, next));
                              }}
                              models={litellmModels}
                              placeholder={DEFAULT_LITELLM_MODEL_NAME}
                              loading={litellmModelsQ.isLoading}
                            />
                          </Field>
                          <Field>
                            <FieldLabel>API base no tenant</FieldLabel>
                            <Input
                              value={litellmAPIBase}
                              onChange={(e) => setLiteLLMAPIBase(e.target.value)}
                              placeholder="Usar LITELLM_URL"
                            />
                          </Field>
                          <Field>
                            <FieldLabel>Fallbacks</FieldLabel>
                            <LiteLLMModelMultiSelect
                              value={litellmFallbacks}
                              onChange={setLiteLLMFallbacks}
                              models={litellmModels}
                              placeholder="Adicionar fallback"
                              emptyText="Nenhum fallback selecionado"
                              exclude={[litellmModelName]}
                              loading={litellmModelsQ.isLoading}
                            />
                            <FieldDescription>Selecione na ordem de tentativa.</FieldDescription>
                          </Field>
                          <Field className="sm:col-span-2">
                            <FieldLabel>Modelos liberados na chave</FieldLabel>
                            <LiteLLMModelMultiSelect
                              value={litellmAllowedModels}
                              onChange={setLiteLLMAllowedModels}
                              models={litellmModels}
                              placeholder="Adicionar modelo liberado"
                              emptyText="Vazio = principal + fallbacks"
                              loading={litellmModelsQ.isLoading}
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
                            <a
                              href={duplicateTenant.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-foreground"
                            >
                              {duplicateTenant.url}
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex justify-between border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Voltar
                </Button>
                <Button type="button" onClick={submit} disabled={m.isPending}>
                  {m.isPending ? (
                    <IconLoader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <IconSparkles data-icon="inline-start" />
                  )}
                  {m.isPending ? "Preparando..." : "Criar Tenant"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Result dialog — unchanged logic ─────────────────────────────── */}
      <Dialog
        open={!!result}
        onClose={closeResultDialog}
        title={dialogTitle}
        size="lg"
        closable={!isProvisioning}
      >
        {result ? (
          <div className="flex flex-col gap-4 text-sm">
            {result.warning || result.access_warning ? (
              <Alert className="border-chart-3/40 bg-chart-3/10">
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  {result.access_warning ?? result.warning}
                </AlertDescription>
              </Alert>
            ) : null}

            {isProvisioning ? (
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <IconLoader2 className="size-4 animate-spin" />
                  Área do cliente iniciando
                </AlertTitle>
                <AlertDescription>
                  <div>
                    Validando o provisionamento e o subdomínio. O pacote de acesso será liberado
                    automaticamente quando a área responder.
                  </div>
                  {readinessError ? (
                    <div className="mt-1 text-muted-foreground">{readinessError}</div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {hasError ? (
              <Alert className="border-destructive/40 bg-destructive/10">
                <AlertTitle>Erro ao preparar a área</AlertTitle>
                <AlertDescription>
                  {readinessError ?? "Verifique os logs do servidor."}
                </AlertDescription>
              </Alert>
            ) : null}

            {canReleaseAccess && accessLink ? (
              <CopyableField
                label="Link de acesso recomendado"
                value={accessLink}
                accent="emerald"
                variant="tight"
                hint="Use este link para enviar ao responsável. O link curto é preferido quando disponível."
              />
            ) : canReleaseAccess && needsOwnerEmail ? (
              <Empty className="p-5">
                <EmptyTitle>Pacote sem link de acesso</EmptyTitle>
                <EmptyDescription>
                  Use endereço, email e senha inicial abaixo como alternativa.
                </EmptyDescription>
              </Empty>
            ) : null}

            {canReleaseAccess ? (
              <CopyableField label="Endereço da área" value={result.url} variant="tight" />
            ) : null}
            {canReleaseAccess && needsOwnerEmail && ownerEmail ? (
              <CopyableField label="Email do responsável" value={ownerEmail} />
            ) : null}
            {canReleaseAccess && result.initial_password ? (
              <CopyableField
                label="Senha inicial"
                value={result.initial_password}
                warning="Guarde agora: a senha não será exibida novamente."
              />
            ) : null}
            {canReleaseAccess && result.magic_link && result.magic_link !== accessLink ? (
              <CopyableField
                label="Link de acesso completo"
                value={result.magic_link}
                variant="tight"
              />
            ) : null}
            {canReleaseAccess && result.info ? (
              <Alert className="border-chart-2/30 bg-chart-2/10">
                <AlertDescription>{result.info}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={closeResultDialog} disabled={isProvisioning}>
                Fechar
              </Button>
              {canReleaseAccess ? (
                <Button variant="outline" asChild>
                  <a href={result.url} target="_blank" rel="noreferrer">
                    Abrir área
                    <IconExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Abrir área
                  <IconExternalLink data-icon="inline-end" />
                </Button>
              )}
              <Button onClick={markDelivered} disabled={!canReleaseAccess}>
                {isProvisioning ? (
                  <IconLoader2 data-icon="inline-start" className="animate-spin" />
                ) : null}
                {isProvisioning ? "Preparando..." : "Abrir cliente no painel"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", accent && "font-medium text-primary")}>{value}</span>
    </div>
  );
}
