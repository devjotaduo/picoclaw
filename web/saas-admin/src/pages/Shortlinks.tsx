import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Trash2, Plus, ExternalLink } from "lucide-react";

import { listShortlinks, createShortlink, deleteShortlink, type Shortlink } from "@/api/shortlinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDate, relativeTime } from "@/lib/utils";

const TTL_PRESETS: { label: string; seconds: number }[] = [
  { label: "1 dia", seconds: 24 * 3600 },
  { label: "7 dias", seconds: 7 * 24 * 3600 },
  { label: "30 dias (padrão)", seconds: 30 * 24 * 3600 },
  { label: "1 ano (cap)", seconds: 365 * 24 * 3600 },
];

export function Shortlinks() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ["shortlinks"],
    queryFn: listShortlinks,
    refetchInterval: 30_000,
  });

  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [ttlSec, setTtlSec] = useState(30 * 24 * 3600);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () =>
      createShortlink({
        target_url: target.trim(),
        label: label.trim() || undefined,
        ttl_seconds: ttlSec,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shortlinks"] });
      setTarget("");
      setLabel("");
      toast({ type: "success", message: "Link curto criado." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao criar link curto." }),
  });

  const deleteM = useMutation({
    mutationFn: (code: string) => deleteShortlink(code),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shortlinks"] });
      toast({ type: "info", message: "Link curto removido." });
    },
    onError: (e: { error?: string }) =>
      toast({ type: "error", message: e?.error ?? "Falha ao remover." }),
  });

  const copy = async (code: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const links = q.data?.shortlinks ?? [];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-100">Links curtos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Endereços curtos para compartilhar links de acesso e outros endereços longos.
          Validade máxima: 1 ano. Padrão: 30 dias.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Novo link curto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
                Endereço de destino
              </label>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://exemplo.com/caminho/longo"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
                Rótulo (opcional)
              </label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cliente X — link semana 12" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Validade:</span>
            {TTL_PRESETS.map((p) => (
              <button
                key={p.seconds}
                type="button"
                onClick={() => setTtlSec(p.seconds)}
                className={
                  "rounded-md border px-2 py-1 text-xs transition-colors " +
                  (ttlSec === p.seconds
                    ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => createM.mutate()}
              disabled={createM.isPending || !target.trim()}
            >
              <Plus className="h-4 w-4" />
              {createM.isPending ? "Criando..." : "Criar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Destino</th>
              <th className="px-3 py-2 font-medium">Rótulo</th>
              <th className="px-3 py-2 font-medium">Acessos</th>
              <th className="px-3 py-2 font-medium">Criado</th>
              <th className="px-3 py-2 font-medium">Expira</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {q.isLoading && (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={7}>
                  Carregando…
                </td>
              </tr>
            )}
            {!q.isLoading && links.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={7}>
                  Nenhum link curto ainda.
                </td>
              </tr>
            )}
            {links.map((sl: Shortlink) => {
              const expired = new Date(sl.expires_at).getTime() < Date.now();
              return (
                <tr key={sl.code} className={expired ? "opacity-60" : ""}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-300">{sl.code}</span>
                      <button
                        onClick={() => copy(sl.code, sl.short_url)}
                        className="text-zinc-500 hover:text-zinc-200"
                        title={sl.short_url}
                      >
                        {copiedCode === sl.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-zinc-400">
                    <a
                      href={sl.target_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-zinc-200"
                    >
                      <span className="truncate">{sl.target_url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{sl.label || "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{sl.hits}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500" title={formatDate(sl.created_at)}>
                    {relativeTime(sl.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {expired ? (
                      <span className="text-red-400">expirado</span>
                    ) : (
                      <span className="text-zinc-400" title={formatDate(sl.expires_at)}>
                        {relativeTime(sl.expires_at)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-red-300"
                      aria-label={`Excluir ${sl.code}`}
                      onClick={() => {
                        if (confirm(`Apagar link curto /s/${sl.code}? Quem tiver o link verá uma página de link expirado.`)) {
                          deleteM.mutate(sl.code);
                        }
                      }}
                      disabled={deleteM.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
