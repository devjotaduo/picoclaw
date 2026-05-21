// Thin fetch wrapper. The session lives in an HttpOnly cookie set by the control plane,
// so we don't manage it here — just need credentials:"include".

export type ApiError = {
  error: string;
  status: number;
  // body carries the full JSON error payload when the server returned an
  // object — useful for endpoints that surface structured info alongside
  // `error` (e.g. 409 dedup with `tenant_id`+`url`).
  body?: Record<string, unknown>;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    credentials: "include",
    // Bypass the HTTP cache — these endpoints reflect mutable per-tenant state
    // and we don't want a stale GET response right after a PUT/POST.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (resp.status === 204) {
    return undefined as T;
  }
  let body: unknown = undefined;
  const text = await resp.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!resp.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `HTTP ${resp.status}`);
    const err: ApiError = { error: msg, status: resp.status };
    if (body && typeof body === "object") {
      err.body = body as Record<string, unknown>;
    }
    throw err;
  }
  return body as T;
}
