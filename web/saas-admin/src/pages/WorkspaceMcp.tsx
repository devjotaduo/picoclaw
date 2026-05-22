import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { listMCPCatalog } from "@/api/workspace-mcp";
import { getWorkspace } from "@/api/workspaces";

export default function WorkspaceMcp() {
  const { id = "" } = useParams<{ id: string }>();
  const ws = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => getWorkspace(id),
  });
  const catalog = useQuery({
    queryKey: ["mcp-catalog"],
    queryFn: listMCPCatalog,
  });

  if (ws.isLoading || catalog.isLoading) return <div className="p-6">Carregando…</div>;
  if (ws.isError) return <div className="p-6 text-red-600">Erro carregando workspace.</div>;
  if (catalog.isError) return <div className="p-6 text-red-600">Erro carregando catálogo.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link to={`/workspaces/${id}`} className="text-sm text-blue-600 hover:underline">
          ← {ws.data?.name}
        </Link>
        <h1 className="text-2xl font-semibold mt-2">MCPs disponíveis</h1>
        <p className="text-sm text-gray-600 mt-1">
          Servidores MCP que você pode ativar para esse workspace. A ativação fica disponível na próxima entrega.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalog.data?.entries.map((e) => (
          <div key={e.id} className="border rounded-lg p-4 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-gray-500">{e.vendor} · {e.category}</div>
              </div>
              {e.official && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Oficial</span>
              )}
            </div>
            <p className="text-sm text-gray-700">{e.description}</p>
            {e.integrations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {e.integrations.map((i) => (
                  <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 rounded">{i}</span>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-500">
              {e.credentials.length === 0 ? "OAuth (sem credenciais estáticas)" : `${e.credentials.length} credencial(is)`}
              {" · "}
              {e.cost_tier === "free" ? "Grátis" : e.cost_tier === "metered" ? "Cobrança por uso" : "Pago"}
            </div>
            <a href={e.docs_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
              Documentação ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
