import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleDashed, Plug, RotateCcw, Save, X } from "lucide-react";
import { listIntegrations, updateIntegration, type IntegrationField, type SkillIntegration } from "@/api/integrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SkeletonRow } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getSkillDisplay } from "@/lib/skill-display";
import {
  createIntegrationDraft,
  INTEGRATION_STATUS_LABELS,
  setDraftSecret,
  setDraftSecretCleared,
  setDraftValue,
  type IntegrationDraft,
} from "@/lib/integrations";

export function IntegrationsPage() {
  const { id = "" } = useParams();
  const { status } = useAuth();
  const qc = useQueryClient();
  const key = ["integrations", id];
  const q = useQuery({ queryKey: key, queryFn: () => listIntegrations(id) });
  const [drafts, setDrafts] = useState<Record<string, IntegrationDraft>>({});

  useEffect(() => {
    if (!q.data) return;
    const next: Record<string, IntegrationDraft> = {};
    for (const integration of q.data.integrations) {
      next[integration.skill_name] = createIntegrationDraft(integration);
    }
    setDrafts(next);
  }, [q.data]);

  const canEdit = useMemo(() => {
    if (status.state !== "authenticated") return false;
    if (status.me.platform_role === "platform_admin") return true;
    const role = status.me.memberships.find((m) => m.tenant_id === id)?.role;
    return role === "tenant_owner" || role === "tenant_admin";
  }, [id, status]);

  const saveM = useMutation({
    mutationFn: ({ integration, draft }: { integration: SkillIntegration; draft: IntegrationDraft }) =>
      updateIntegration(id, integration.skill_name, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateDraft = (skillName: string, updater: (draft: IntegrationDraft) => IntegrationDraft) => {
    setDrafts((current) => {
      const existing = current[skillName];
      if (!existing) return current;
      return { ...current, [skillName]: updater(existing) };
    });
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        to={`/tenants/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to tenant
      </Link>

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Integrações</h1>
          <p className="text-xs text-zinc-500">
            Configurações das skills ativas que declaram <code>metadata.integration</code>.
          </p>
        </div>
        <Plug className="h-5 w-5 text-zinc-500" />
      </header>

      {q.isError && <div className="text-sm text-red-300">Failed to load integrations.</div>}

      {q.isLoading && (
        <Card>
          <CardContent className="px-0 py-0">
            <table className="w-full">
              <tbody className="divide-y divide-zinc-800/60">
                <SkeletonRow cols={3} />
                <SkeletonRow cols={3} />
                <SkeletonRow cols={3} />
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {q.data && q.data.integrations.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Nenhuma skill ativa declara integração configurável.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {q.data?.integrations.map((integration) => {
          const draft = drafts[integration.skill_name] ?? createIntegrationDraft(integration);
          const schemaInvalid = integration.status === "schema_invalid";
          const skillDisplay = getSkillDisplay({
            name: integration.skill_name,
            description: integration.description,
          });
          const title =
            integration.title && integration.title !== integration.skill_name
              ? integration.title
              : skillDisplay.name;
          const description = integration.description ?? skillDisplay.description;
          return (
            <Card key={integration.skill_name}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{title}</span>
                    <code className="rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-400">
                      {integration.skill_name}
                    </code>
                  </CardTitle>
                  {description && (
                    <p className="mt-1 text-xs text-zinc-500">{description}</p>
                  )}
                </div>
                <IntegrationStatusPill integration={integration} />
              </CardHeader>

              <CardContent className="space-y-4">
                {schemaInvalid ? (
                  <div className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                    {integration.schema_error ?? "Schema inválido."}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {integration.fields?.map((field) => (
                        <FieldControl
                          key={field.key}
                          field={field}
                          integration={integration}
                          draft={draft}
                          canEdit={canEdit}
                          onChange={(next) =>
                            updateDraft(integration.skill_name, (current) => setDraftValue(current, field, next))
                          }
                          onSecret={(next) =>
                            updateDraft(integration.skill_name, (current) =>
                              setDraftSecret(current, field.key, next),
                            )
                          }
                          onClearSecret={(clear) =>
                            updateDraft(integration.skill_name, (current) =>
                              setDraftSecretCleared(current, field.key, clear),
                            )
                          }
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit || saveM.isPending}
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [integration.skill_name]: createIntegrationDraft(integration),
                          }))
                        }
                      >
                        <RotateCcw className="h-4 w-4" /> Reverter
                      </Button>
                      <Button
                        size="sm"
                        disabled={!canEdit || saveM.isPending}
                        onClick={() => saveM.mutate({ integration, draft })}
                      >
                        <Save className="h-4 w-4" /> {saveM.isPending ? "Salvando..." : "Salvar"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FieldControl({
  field,
  integration,
  draft,
  canEdit,
  onChange,
  onSecret,
  onClearSecret,
}: {
  field: IntegrationField;
  integration: SkillIntegration;
  draft: IntegrationDraft;
  canEdit: boolean;
  onChange: (value: unknown) => void;
  onSecret: (value: string) => void;
  onClearSecret: (clear: boolean) => void;
}) {
  const id = `${integration.skill_name}-${field.key}`;
  const value = draft.values[field.key];
  const clearSecret = draft.clear_secrets.includes(field.key);
  const secretConfigured = Boolean(integration.secrets[field.key]) && !clearSecret;

  return (
    <div className={cn(field.type === "textarea" && "md:col-span-2")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="mb-0">
          {field.label}
          {field.required && <span className="ml-1 text-brand-400">*</span>}
        </Label>
        {field.type === "secret" && (
          <span className={cn("text-[10px]", secretConfigured ? "text-emerald-300" : "text-zinc-500")}>
            {secretConfigured ? "configurado" : clearSecret ? "limpar ao salvar" : "pendente"}
          </span>
        )}
      </div>
      {renderFieldControl({
        id,
        field,
        value,
        disabled: !canEdit,
        secretValue: draft.secrets[field.key] ?? "",
        secretConfigured,
        clearSecret,
        onChange,
        onSecret,
        onClearSecret,
      })}
      {field.help && <p className="mt-1 text-[11px] text-zinc-500">{field.help}</p>}
    </div>
  );
}

function renderFieldControl({
  id,
  field,
  value,
  disabled,
  secretValue,
  secretConfigured,
  clearSecret,
  onChange,
  onSecret,
  onClearSecret,
}: {
  id: string;
  field: IntegrationField;
  value: unknown;
  disabled: boolean;
  secretValue: string;
  secretConfigured: boolean;
  clearSecret: boolean;
  onChange: (value: unknown) => void;
  onSecret: (value: string) => void;
  onClearSecret: (clear: boolean) => void;
}) {
  if (field.type === "textarea") {
    return (
      <textarea
        id={id}
        disabled={disabled}
        rows={4}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-brand-500 disabled:opacity-50"
      />
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="flex h-9 items-center">
        <Toggle checked={Boolean(value)} onChange={onChange} disabled={disabled} label={field.label} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={id}
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm focus:border-brand-500 disabled:opacity-50"
      >
        <option value="">Selecione</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <select
        id={id}
        multiple
        disabled={disabled}
        value={selected}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((option) => option.value))}
        className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-brand-500 disabled:opacity-50"
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "secret") {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          disabled={disabled || clearSecret}
          value={secretValue}
          placeholder={secretConfigured ? "Configurado" : "Novo valor"}
          onChange={(e) => onSecret(e.target.value)}
        />
        {secretConfigured || clearSecret ? (
          <Button
            type="button"
            variant={clearSecret ? "secondary" : "outline"}
            size="icon"
            disabled={disabled}
            aria-label={clearSecret ? "Cancelar limpeza" : "Limpar secret"}
            onClick={() => onClearSecret(!clearSecret)}
          >
            {clearSecret ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
      disabled={disabled}
      value={String(value ?? "")}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function IntegrationStatusPill({ integration }: { integration: SkillIntegration }) {
  const icon =
    integration.status === "configured" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : integration.status === "schema_invalid" ? (
      <CircleAlert className="h-3.5 w-3.5" />
    ) : (
      <CircleDashed className="h-3.5 w-3.5" />
    );
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        integration.status === "configured" && "border-emerald-900 bg-emerald-950 text-emerald-300",
        integration.status === "pending" && "border-amber-900 bg-amber-950 text-amber-300",
        integration.status === "schema_invalid" && "border-red-900 bg-red-950 text-red-300",
      )}
    >
      {icon}
      {INTEGRATION_STATUS_LABELS[integration.status]}
    </span>
  );
}
