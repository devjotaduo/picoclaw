import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AlertTriangle, CheckCircle, PauseCircle, DollarSign, Zap } from "lucide-react";
import { getPlatformStats, getPlatformTimeseries } from "@/api/platform";

export function PlatformDashboard() {
  const navigate = useNavigate();
  const stats = useQuery({ queryKey: ["platform-stats"], queryFn: getPlatformStats, refetchInterval: 30_000 });
  const series = useQuery({
    queryKey: ["platform-timeseries", 30],
    queryFn: () => getPlatformTimeseries(30),
    refetchInterval: 60_000,
  });

  const s = stats.data;
  const points = (series.data?.points ?? []).map((p) => ({
    day: p.day.slice(5, 10), // MM-DD
    cost: Number(p.cost_usd.toFixed(4)),
    tokens: p.tokens,
  }));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Platform dashboard</h1>
        <p className="text-xs text-zinc-500">Current month · auto-refreshes every 30 s</p>
      </header>

      {stats.isError && (
        <div className="mb-4 rounded bg-red-950/50 p-3 text-xs text-red-300">
          Failed to load platform stats.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Active"
          value={s?.active_tenants ?? "—"}
          icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
          onClick={() => navigate("/tenants?status=active")}
        />
        <StatCard
          label="Suspended"
          value={s?.suspended_tenants ?? "—"}
          icon={<PauseCircle className="h-4 w-4 text-amber-400" />}
          onClick={() => navigate("/tenants?status=suspended")}
        />
        <StatCard
          label="Errors"
          value={s?.error_tenants ?? "—"}
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
          onClick={() => navigate("/tenants?status=error")}
          highlight={(s?.error_tenants ?? 0) > 0}
        />
        <StatCard
          label="Cost / mo"
          value={s != null ? `$${s.total_cost_usd.toFixed(2)}` : "—"}
          icon={<DollarSign className="h-4 w-4 text-zinc-400" />}
        />
        <StatCard
          label="Tokens / mo"
          value={s != null ? fmtTokens(s.total_tokens) : "—"}
          icon={<Zap className="h-4 w-4 text-zinc-400" />}
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Daily cost — last 30 days</span>
          {series.isFetching && <span className="text-xs text-zinc-500">Updating…</span>}
        </div>
        {series.isLoading ? (
          <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
            Loading chart…
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
            No usage data for the period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "#e4e4e7" }}
                formatter={(v) => [`$${Number(v).toFixed(4)}`, "Cost"]}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#22d3ee"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Daily tokens — last 30 days</span>
        </div>
        {series.isLoading ? (
          <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
            Loading chart…
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-zinc-500">
            No usage data for the period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmtTokens(Number(v))}
              />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "#e4e4e7" }}
                formatter={(v) => [fmtTokens(Number(v)), "Tokens"]}
              />
              <Line
                type="monotone"
                dataKey="tokens"
                stroke="#a78bfa"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  onClick,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const base =
    "flex flex-col gap-2 rounded-lg border p-4 transition-colors";
  const cls = highlight
    ? `${base} border-red-800 bg-red-950/30 ${onClick ? "cursor-pointer hover:bg-red-950/50" : ""}`
    : `${base} border-zinc-800 bg-zinc-950/70 ${onClick ? "cursor-pointer hover:bg-zinc-900/60" : ""}`;
  return (
    <div className={cls} onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
