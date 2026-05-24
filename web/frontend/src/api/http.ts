import { isLauncherPublicPathname } from "@/lib/launcher-login-path"

// Returns true when the current pathname is a launcher page that must
// stay accessible without dashboard auth — login/setup AND the public
// onboarding chat at /sofia-onboarding. The public-onboarding page is
// served on tenants with is_public=true to anonymous visitors, so the
// 401-redirect handler below MUST NOT bounce them to /launcher-login
// (which itself is an authenticated dashboard page they have no
// account for); otherwise the first call to /api/launcher/policy that
// 401s yanks them off the chat and into a login they can't pass.
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
 * Skips redirect while already on a launcher public page (login, setup, or
 * sofia-onboarding) to avoid reload loops AND to keep anonymous visitors on
 * is_public=true tenants on the chat page when private API calls 401.
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
