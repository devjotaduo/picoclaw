import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getTenantOnboardingState,
  promoteTenant,
  type OnboardingState,
  type PromoteTenantResponse,
  type Tenant,
} from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableField } from "@/components/ui/copyable-field";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

// PromoteTenantCard renders the "Promover" action block on tenant detail
// for tenants where is_public === true. Shows the current onboarding
// phase, lists what's blocking the promotion (if anything), and exposes
// a modal that POSTs to /api/v1/tenants/{id}/promote with an optional
// owner_email override and a force flag for admin escape hatch.
//
// On success, shows the credentials dialog with URL + initial_password
// (copyable). Closeable=false so the admin doesn't lose the password.

function PhaseBadge({ phase }: { phase: OnboardingState["phase"] }) {
  const styles: Record<OnboardingState["phase"], string> = {
    discovery_in_progress: "bg-zinc-700 text-zinc-200",
    discovery_done: "bg-blue-900/60 text-blue-200",
    deepening_in_progress: "bg-indigo-900/60 text-indigo-200",
    ready_for_promotion: "bg-emerald-900/60 text-emerald-200",
    promoted: "bg-zinc-800 text-zinc-400",
  };
  const labels: Record<OnboardingState["phase"], string> = {
    discovery_in_progress: "Sofia conduzindo discovery",
    discovery_done: "Discovery concluído — aguardando Catarina",
    deepening_in_progress: "Catarina aprofundando",
    ready_for_promotion: "Pronto pra promover",
    promoted: "Já promovido",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${styles[phase]}`}>
      {labels[phase]}
    </span>
  );
}

export function PromoteTenantCard(props: { tenant: Tenant }) {
  const { tenant } = props;
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [emailOverride, setEmailOverride] = useState("");
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<PromoteTenantResponse | null>(null);

  const stateQ = useQuery({
    queryKey: ["tenant-onboarding-state", tenant.id],
    queryFn: () => getTenantOnboardingState(tenant.id),
    enabled: tenant.is_public,
    staleTime: 10_000,
  });

  const promoteM = useMutation({
    mutationFn: () =>
      promoteTenant(tenant.id, {
        force,
        owner_email: emailOverride.trim().toLowerCase() || undefined,
        force_reason: force ? forceReason.trim() : undefined,
      }),
    onSuccess: async (r) => {
      setResult(r);
      setError("");
      // Tenant list + detail refresh — tenant flipped to is_public=false.
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      await qc.invalidateQueries({ queryKey: ["tenant", tenant.id] });
      await qc.invalidateQueries({ queryKey: ["tenant-onboarding-state", tenant.id] });
    },
    onError: (e: { error?: string; blocked_by?: string[]; hint?: string }) => {
      const parts = [e?.error ?? "Falha ao promover"];
      if (e?.blocked_by?.length) parts.push("Bloqueado por: " + e.blocked_by.join(", "));
      if (e?.hint) parts.push(e.hint);
      setError(parts.join(" — "));
    },
  });

  // If this isn't a public tenant, the card shouldn't render at all.
  // (Parent should guard, but defense in depth.)
  if (!tenant.is_public) return null;

  const state = stateQ.data;
  const ready = state?.promotion?.ready === true;
  const blockedBy = state?.promotion?.blocked_by ?? [];
  const capturedEmail = state?.owner_captured?.email ?? "";
  const capturedName = state?.owner_captured?.name ?? "";
  const capturedWA = state?.owner_captured?.whatsapp ?? "";

  return (
    <>
      <Card className="border-amber-900/40 bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span>Promover para cliente</span>
            {state && <PhaseBadge phase={state.phase} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-zinc-300">
          {!state && !stateQ.isLoading && (
            <p className="text-zinc-500">
              Sem <code>workspace/state/onboarding.json</code> — Sofia ainda não rodou nesse tenant.
              Você pode forçar a promoção com o checkbox abaixo + email manual.
            </p>
          )}

          {state && (
            <div className="space-y-2 text-zinc-400">
              {capturedEmail ? (
                <p>
                  <strong className="text-zinc-200">Capturado pela Sofia:</strong>{" "}
                  {capturedName && `${capturedName} · `}
                  <span className="text-zinc-200">{capturedEmail}</span>
                  {capturedWA && <span className="text-zinc-500"> · WhatsApp {capturedWA}</span>}
                </p>
              ) : (
                <p className="text-zinc-500">Sofia ainda não capturou email do dono.</p>
              )}

              {state.discovery?.segment && (
                <p>
                  <strong className="text-zinc-200">Segmento:</strong> {state.discovery.segment}
                </p>
              )}

              <p>
                <strong className="text-zinc-200">Áreas de aprofundamento:</strong>{" "}
                {state.deepening?.areas_covered?.length ?? 0} / {state.deepening?.areas_required?.length ?? 5}
                {state.deepening?.areas_covered && state.deepening.areas_covered.length > 0 && (
                  <span className="ml-1 text-zinc-500">
                    ({state.deepening.areas_covered.join(", ")})
                  </span>
                )}
              </p>

              {!ready && blockedBy.length > 0 && (
                <p className="text-amber-300">
                  <strong>Bloqueado por:</strong> {blockedBy.join(", ")}
                </p>
              )}

              {ready && (
                <p className="text-emerald-300">
                  <strong>Tudo pronto.</strong> Pode promover normalmente — owner será criado, senha gerada, container recriado, email enviado.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setEmailOverride(capturedEmail);
                setForce(false);
                setError("");
                setModalOpen(true);
              }}
              disabled={stateQ.isLoading}
              variant={ready ? "default" : "outline"}
            >
              {ready ? "Promover" : "Promover (com override)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={modalOpen && !result}
        onClose={() => setModalOpen(false)}
        title="Promover tenant para cliente"
        size="md"
      >
        <div className="space-y-4 text-sm">
          <p className="text-zinc-400">
            Vai criar o owner user, gerar senha, flipar <code>ui-visibility</code> pra
            tenant, recriar o container e mandar email com credenciais. Não dá pra desfazer fácil — confira antes.
          </p>

          <div>
            <Label htmlFor="owner_email_override">Email do owner</Label>
            <Input
              id="owner_email_override"
              type="email"
              value={emailOverride}
              onChange={(e) => setEmailOverride(e.target.value)}
              placeholder={capturedEmail || "owner@empresa.com.br"}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              {capturedEmail
                ? `Sofia capturou: ${capturedEmail}. Você pode corrigir aqui se quiser.`
                : "Sofia não capturou. Você precisa preencher manualmente."}
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <span>
              <strong>Forçar promoção</strong> — pula o gate do <code>state.json</code>.{" "}
              <span className="text-zinc-500">
                Use quando o onboarding não rodou completo (cliente simples sem deepening,
                ou Sofia teve problema). A ação fica registrada no audit log.
              </span>
            </span>
          </label>

          {force && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Motivo da promoção forçada
              </label>
              <textarea
                className="min-h-20 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
                placeholder="Explique por que o admin está liberando antes do onboarding completo."
              />
            </div>
          )}

          {error && (
            <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={promoteM.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => promoteM.mutate()}
              disabled={
                promoteM.isPending ||
                (!emailOverride.trim() && !capturedEmail) ||
                (force && !forceReason.trim())
              }
            >
              {promoteM.isPending ? "Promovendo…" : "Promover"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!result}
        onClose={() => {
          setResult(null);
          setModalOpen(false);
        }}
        title="Tenant promovido"
        size="md"
        closable={false}
      >
        {result && (
          <div className="space-y-3 text-sm">
            {result.warning && <p className="text-amber-300">{result.warning}</p>}
            <p className="text-emerald-300">{result.info}</p>

            <div>
              <Label>URL</Label>
              <div className="rounded bg-zinc-950 px-3 py-2 font-mono text-xs">
                <a href={result.url} target="_blank" rel="noreferrer" className="text-brand-500 underline">
                  {result.url}
                </a>
              </div>
            </div>

            <CopyableField label="Email do owner" value={result.owner_email} />
            <CopyableField label="Senha inicial" value={result.initial_password} />
            <p className="text-[11px] text-amber-300">
              Salva a senha agora. Não vai ser exibida de novo nesta tela.
            </p>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  setResult(null);
                  setModalOpen(false);
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
