// When the app is served behind the picoclaw-saas controlplane reverse proxy, Vite
// is configured with `base: "/crm/"`, so import.meta.env.BASE_URL is "/crm/".
// We strip the trailing slash and prepend it to every fetch so calls end up
// at "/crm/api/...". In the upstream / vanilla dev build BASE_URL is "/" → no
// effective prefix.
const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {}, credentials: "same-origin" };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}
