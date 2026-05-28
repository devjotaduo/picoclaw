import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { getMe, login as apiLogin, logout as apiLogout, type Me } from "@/api/admin";

type AuthState =
  | { state: "loading" }
  | { state: "authenticated"; me: Me }
  | { state: "anonymous" };

type AuthCtx = {
  status: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<AuthState>({ state: "loading" });
  const isPublicRoute = location.pathname === "/accept-invite";

  const refresh = async () => {
    try {
      const me = await getMe();
      setStatus({ state: "authenticated", me });
    } catch {
      setStatus({ state: "anonymous" });
    }
  };

  useEffect(() => {
    if (isPublicRoute) {
      setStatus({ state: "anonymous" });
      return;
    }
    refresh();
  }, [isPublicRoute]);

  const signIn = async (email: string, password: string) => {
    await apiLogin(email, password);
    await refresh();
  };

  const signOut = async () => {
    await apiLogout();
    setStatus({ state: "anonymous" });
  };

  return <Ctx.Provider value={{ status, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
