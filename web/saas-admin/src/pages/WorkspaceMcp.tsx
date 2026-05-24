import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  listMCPCatalog,
  listWorkspaceMCP,
  putWorkspaceMCP,
  deleteWorkspaceMCP,
  type MCPActivation,
  type MCPCatalogEntry,
} from "@/api/workspace-mcp";
import { getWorkspace } from "@/api/workspaces";

function extractApiErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string") {
    return (e as { error: string }).error;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return "Erro desconhecido";
}

export default function WorkspaceMcp() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const ws = useQuery({ queryKey: ["workspace", id], queryFn: () => getWorkspace(id) });
  const catalog = useQuery({ queryKey: ["mcp-catalog"], queryFn: listMCPCatalog });
  const activations = useQuery({
    queryKey: ["workspace-mcp", id],
    queryFn: () => listWorkspaceMCP(id),
  });

  const [modal, setModal] = useState<MCPCatalogEntry | null>(null);

  const deactivate = useMutation({
    mutationFn: (catalogId: string) => deleteWorkspaceMCP(id, catalogId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-mcp", id] });
    },
    onError: (e: unknown) => {
      alert(extractApiErrorMessage(e));
    },
  });

  if (ws.isLoading || catalog.isLoading || activations.isLoading) {
    return <div className="p-6">Carregando…</div>;
  }
  if (ws.isError || catalog.isError || activations.isError) {
    return <div className="p-6 text-red-600">Erro carregando dados.</div>;
  }

  const activeMap = new Map(activations.data?.servers.map((s) => [s.catalog_id, s]) ?? []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link to={`/workspaces/${id}`} className="text-sm text-blue-600 hover:underline">
          ← {ws.data?.name}
        </Link>
        <h1 className="text-2xl font-semibold mt-2">MCPs do workspace</h1>
        <p className="text-sm text-gray-600 mt-1">
          Ative os servidores MCP que os agentes desse workspace poderão usar. Credenciais ficam criptografadas no controlplane e são injetadas em cada tenant durante o provisionamento.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalog.data?.entries.map((e) => {
          const active = activeMap.get(e.id);
          const isDeactivating = deactivate.isPending && deactivate.variables === e.id;
          return (
            <div key={e.id} className="border rounded-lg p-4 bg-white space-y-2 flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-gray-500">{e.vendor} · {e.category}</div>
                </div>
                <div className="flex gap-1">
                  {active?.enabled && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">Ativo</span>
                  )}
                  {e.official && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Oficial</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-700">{e.description}</p>
              <div className="text-xs text-gray-500 mt-auto">
                {e.cost_tier === "free" ? "Grátis" : e.cost_tier === "metered" ? "Cobrança por uso" : "Pago"}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
                  onClick={() => setModal(e)}
                >
                  {active ? "Editar" : "Ativar"}
                </button>
                {active && (
                  <button
                    type="button"
                    className="text-xs px-3 py-1 border rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={isDeactivating}
                    onClick={() => {
                      if (!confirm(`Desativar ${e.name}?`)) return;
                      deactivate.mutate(e.id);
                    }}
                  >
                    {isDeactivating ? "Desativando…" : "Desativar"}
                  </button>
                )}
                <a
                  href={e.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1 text-blue-600 hover:underline ml-auto"
                >
                  Docs ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <ActivationModal
          entry={modal}
          workspaceId={id}
          active={activeMap.get(modal.id)}
          onClose={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey: ["workspace-mcp", id] });
          }}
        />
      )}
    </div>
  );
}

function ActivationModal({
  entry,
  workspaceId,
  active,
  onClose,
}: {
  entry: MCPCatalogEntry;
  workspaceId: string;
  active?: MCPActivation;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const save = useMutation({
    mutationFn: () =>
      putWorkspaceMCP(workspaceId, entry.id, { enabled: true, credentials: values }),
    onSuccess: onClose,
    onError: (e: unknown) => {
      setError(extractApiErrorMessage(e));
    },
  });

  const showEditHint =
    entry.credentials.length > 0 &&
    !!active?.enabled &&
    Object.keys(active.credentials_masked).length > 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
        }}
        className="bg-white rounded-lg p-6 w-full max-w-md space-y-4 outline-none"
      >
        <h3 id="mcp-modal-title" className="text-lg font-semibold">
          Ativar {entry.name}
        </h3>
        <p className="text-sm text-gray-600">{entry.description}</p>
        {entry.credentials.length === 0 ? (
          <p className="text-sm text-gray-700">
            Esse MCP usa OAuth — a autenticação acontece automaticamente na primeira conexão dentro do tenant. Sem credenciais para preencher aqui.
          </p>
        ) : (
          <div className="space-y-3">
            {showEditHint && (
              <p className="text-xs text-gray-500">
                Deixe em branco para manter o valor atual.
              </p>
            )}
            {entry.credentials.map((c) => (
              <div key={c.key}>
                <label className="block text-sm font-medium">
                  {c.label} {c.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={c.secret ? "password" : "text"}
                  placeholder={c.placeholder}
                  className="mt-1 w-full border rounded px-2 py-1 text-sm"
                  value={values[c.key] ?? ""}
                  onChange={(ev) =>
                    setValues((v) => ({ ...v, [c.key]: ev.target.value }))
                  }
                />
                {c.help && <p className="text-xs text-gray-500 mt-1">{c.help}</p>}
              </div>
            ))}
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1 border rounded text-sm"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={save.isPending}
            onClick={() => {
              setError("");
              save.mutate();
            }}
          >
            {save.isPending ? "Salvando…" : "Ativar"}
          </button>
        </div>
      </div>
    </div>
  );
}
