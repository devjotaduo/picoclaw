import { isLauncherPublicPathname } from "@/lib/launcher-login-path"

// Returns true when the current pathname is a launcher page that must
// stay accessible without dashboard auth (login/setup).
function isLauncherPublicPath(): boolean {
  if (typeof globalThis.location === "undefined") {
    return false
  }
  if (isLauncherPublicPathname(globalThis.location.pathname || "/")) {
    return true
  }
  try {
    return isLauncherPublicPathname(
      new URL(globalThis.location.href).pathname || "/",
    )
  } catch {
    return false
  }
}

/**
 * Same-origin fetch that sends cookies; redirects to launcher login on 401 JSON responses.
 * Skips redirect while already on a launcher public page (login, setup) to
 * avoid reload loops.
 */
export async function launcherFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    credentials: "same-origin",
    ...init,
  })
  if (res.status === 401) {
    const ct = res.headers.get("content-type") || ""
    if (
      ct.includes("application/json") &&
      typeof globalThis.location !== "undefined" &&
      !isLauncherPublicPath()
    ) {
      globalThis.location.assign("/launcher-login")
    }
  }
  return res
}
