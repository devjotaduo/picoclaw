/** Normalize URL pathname for comparisons (trailing slashes, empty). */
export function normalizePathname(p: string): string {
  const t = p.replace(/\/+$/, "")
  return t === "" ? "/" : t
}

export function isLauncherLoginPathname(pathname: string): boolean {
  return normalizePathname(pathname) === "/launcher-login"
}

export function isLauncherSetupPathname(pathname: string): boolean {
  return normalizePathname(pathname) === "/launcher-setup"
}

export function isSofiaOnboardingPathname(pathname: string): boolean {
  return normalizePathname(pathname) === "/sofia-onboarding"
}

/** True for any page that is part of the auth flow (login or setup). */
export function isLauncherAuthPathname(pathname: string): boolean {
  return isLauncherLoginPathname(pathname) || isLauncherSetupPathname(pathname)
}

/** True for launcher pages that must render without authenticated app chrome. */
export function isLauncherPublicPathname(pathname: string): boolean {
  return isLauncherAuthPathname(pathname) || isSofiaOnboardingPathname(pathname)
}
