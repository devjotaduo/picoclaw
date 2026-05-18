import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Boxes,
  Clock,
} from "lucide-react";
import { getServerHealth, type ServerHealth as ServerHealthData } from "@/api/server-health";

export function ServerHealth() {
  const q = useQuery({
    queryKey: ["server-health"],
    queryFn: getServerHealth,
    refetchInterval: 15_000,
  });

  const data = q.data;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Saúde do servidor</h1>
          <p className="text-xs text-zinc-500">
            Atualiza a cada 15 s · host, processo controlplane, Docker, tenants
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {q.isFetching && <span>Atualizando…</span>}
          {!q.isFetching && data && (
            <span>Última leitura: {new Date(data.now).toLocaleTimeString()}</span>
          )}
        </div>
      </header>

      {q.isError && (
        <div className="mb-4 rounded bg-red-950/50 p-3 text-xs text-red-300">
          Falha ao carregar métricas:{" "}
          {(q.error as { error?: string })?.error ?? "erro desconhecido"}
        </div>
      )}

      {!data && q.isLoading && (
        <div className="rounded border border-zinc-800 bg-zinc-950/70 p-6 text-sm text-zinc-500">
          Carregando…
        </div>
      )}

      {data && <Sections data={data} />}
    </div>
  );
}

function Sections({ data }: { data: ServerHealthData }) {
  const memUsedKB = data.host.mem_total_kb - data.host.mem_available_kb;
  const memUsedPct =
    data.host.mem_total_kb > 0 ? (memUsedKB / data.host.mem_total_kb) * 100 : 0;
  const loadPerCPU =
    data.host.cpu_count > 0 ? data.host.load_1 / data.host.cpu_count : data.host.load_1;
  const loadPct = Math.min(100, loadPerCPU * 100);
  const swapUsed = data.host.swap_total_kb - data.host.swap_free_kb;
  const swapPct =
    data.host.swap_total_kb > 0 ? (swapUsed / data.host.swap_total_kb) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Host"
          value={data.host.hostname || "—"}
          sub={data.host.kernel}
          icon={<Server className="h-4 w-4 text-zinc-400" />}
        />
        <StatCard
          label="Uptime do host"
          value={fmtUptime(data.host.uptime_sec)}
          sub={`processo: ${fmtUptime(data.process.uptime_sec)}`}
          icon={<Clock className="h-4 w-4 text-zinc-400" />}
        />
        <StatCard
          label="Tenants ativos"
          value={data.tenants.active}
          sub={`susp ${data.tenants.suspended} · erro ${data.tenants.errors}`}
          icon={
            data.tenants.errors > 0 ? (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            )
          }
          highlight={data.tenants.errors > 0}
        />
        <StatCard
          label="Containers"
          value={`${data.tenants.managed_running}/${data.tenants.managed_containers}`}
          sub={`parados ${data.tenants.managed_stopped}`}
          icon={<Boxes className="h-4 w-4 text-zinc-400" />}
          highlight={
            data.tenants.managed_stopped > 0 && data.tenants.managed_containers > 0
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GaugeCard
          icon={<Cpu className="h-4 w-4 text-zinc-400" />}
          label={`Load average (${data.host.cpu_count} CPUs)`}
          primary={data.host.load_1.toFixed(2)}
          secondary={`5 min: ${data.host.load_5.toFixed(2)} · 15 min: ${data.host.load_15.toFixed(2)}`}
          pct={loadPct}
          warn={loadPct >= 80}
        />
        <GaugeCard
          icon={<MemoryStick className="h-4 w-4 text-zinc-400" />}
          label="Memória"
          primary={`${memUsedPct.toFixed(1)}%`}
          secondary={`${fmtKB(memUsedKB)} de ${fmtKB(data.host.mem_total_kb)} usados`}
          pct={memUsedPct}
          warn={memUsedPct >= 85}
        />
        <GaugeCard
          icon={<MemoryStick className="h-4 w-4 text-zinc-400" />}
          label="Swap"
          primary={data.host.swap_total_kb > 0 ? `${swapPct.toFixed(1)}%` : "—"}
          secondary={
            data.host.swap_total_kb > 0
              ? `${fmtKB(swapUsed)} de ${fmtKB(data.host.swap_total_kb)}`
              : "swap desabilitado"
          }
          pct={swapPct}
          warn={swapPct >= 50}
        />
      </div>

      <Section title="Disco" icon={<HardDrive className="h-4 w-4 text-zinc-400" />}>
        {data.disks.length === 0 ? (
          <div className="text-xs text-zinc-500">Nenhum ponto de montagem coletado.</div>
        ) : (
          <div className="space-y-2">
            {data.disks.map((d) => (
              <DiskRow key={d.path} disk={d} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Docker" icon={<Boxes className="h-4 w-4 text-zinc-400" />}>
        {data.docker.reachable ? (
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <KV k="Engine" v={data.docker.server_version ?? "—"} />
            <KV k="API" v={data.docker.api_version ?? "—"} />
            <KV k="Storage driver" v={data.docker.storage_driver ?? "—"} />
            <KV k="OS" v={data.docker.operating_system ?? "—"} />
            <KV k="CPUs" v={data.docker.ncpu ?? "—"} />
            <KV
              k="Memória"
              v={data.docker.mem_total ? fmtBytes(data.docker.mem_total) : "—"}
            />
            <KV
              k="Containers"
              v={`${data.docker.containers_running ?? 0}/${data.docker.containers_all ?? 0} rodando`}
            />
            <KV k="Imagens" v={data.docker.images ?? "—"} />
          </div>
        ) : (
          <div className="rounded bg-red-950/40 p-3 text-xs text-red-300">
            Docker engine não disponível
            {data.docker.error ? `: ${data.docker.error}` : "."}
          </div>
        )}
      </Section>

      <Section
        title="Containers gerenciados (tenants)"
        icon={<Activity className="h-4 w-4 text-zinc-400" />}
      >
        {data.containers.length === 0 ? (
          <div className="text-xs text-zinc-500">Nenhum container gerenciado encontrado.</div>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-left text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.containers.map((c) => (
                  <tr key={c.name} className="border-t border-zinc-800/70">
                    <td className="px-3 py-1.5 font-mono text-zinc-300">{c.name}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{c.tenant_id || "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      {c.running ? (
                        <span className="text-emerald-400">running</span>
                      ) : (
                        <span className="text-red-400">stopped</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Processo controlplane" icon={<Cpu className="h-4 w-4 text-zinc-400" />}>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <KV k="PID" v={data.process.pid} />
          <KV k="Goroutines" v={data.process.num_goroutine} />
          <KV k="Heap em uso" v={fmtBytes(data.process.alloc_bytes)} />
          <KV k="Memória virtual" v={fmtBytes(data.process.sys_bytes)} />
          <KV k="Coletas de lixo" v={data.process.num_gc} />
          <KV k="Go" v={data.process.go_version} />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {children}
    </section>
  );
}

function DiskRow({ disk }: { disk: ServerHealthData["disks"][number] }) {
  if (!disk.available) {
    return (
      <div className="text-xs text-zinc-500">
        <span className="font-mono">{disk.path}</span> — indisponível
      </div>
    );
  }
  const warn = disk.used_pct >= 85;
  const critical = disk.used_pct >= 95;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-mono text-zinc-300">{disk.path}</span>
        <span className={critical ? "text-red-400" : warn ? "text-amber-400" : "text-zinc-400"}>
          {disk.used_pct.toFixed(1)}% — {disk.used_gb.toFixed(1)} GB de {disk.total_gb.toFixed(1)} GB
          ({disk.free_gb.toFixed(1)} GB livres)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
        <div
          className={`h-full ${
            critical ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(100, disk.used_pct)}%` }}
        />
      </div>
    </div>
  );
}

function GaugeCard({
  icon,
  label,
  primary,
  secondary,
  pct,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  pct: number;
  warn?: boolean;
}) {
  const bar = pct >= 95 ? "bg-red-500" : warn ? "bg-amber-500" : "bg-cyan-500";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mb-1 text-2xl font-semibold tabular-nums">{primary}</div>
      <div className="mb-2 text-[11px] text-zinc-500">{secondary}</div>
      <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  const base = "flex flex-col gap-2 rounded-lg border p-4";
  const cls = highlight
    ? `${base} border-red-800 bg-red-950/30`
    : `${base} border-zinc-800 bg-zinc-950/70`;
  return (
    <div className={cls}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        {icon}
      </div>
      <span className="truncate text-xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="truncate text-[11px] text-zinc-500">{sub}</span>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase text-zinc-500">{k}</span>
      <span className="text-zinc-200">{v}</span>
    </div>
  );
}

function fmtUptime(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtKB(kb: number): string {
  return fmtBytes(kb * 1024);
}

function fmtBytes(b: number): string {
  if (!b || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
