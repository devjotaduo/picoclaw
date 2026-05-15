import { useEffect, useMemo } from "preact/hooks";
import { CrmContext } from "./context";
import { useCrmState } from "./hooks/use-crm";
import { Sidebar } from "./components/sidebar";
import { DataTable } from "./components/data-table";
import { ErrorBanner } from "./components/error-banner";
import type { View } from "./types";

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  const isAgent = useMemo(
    () => params.has("agent") || params.get("mode") === "agent",
    [params],
  );

  const isEmbedded = useMemo(
    () => params.has("embedded") || params.get("mode") === "embedded",
    [params],
  );

  const initialView = useMemo<View | undefined>(() => {
    const v = params.get("view");
    return v === "contacts" || v === "companies" || v === "deals" ? v : undefined;
  }, [params]);

  useEffect(() => {
    if (isAgent) document.documentElement.setAttribute("data-agent", "");
    if (isEmbedded) document.documentElement.setAttribute("data-embedded", "");
  }, [isAgent, isEmbedded]);

  const crmState = useCrmState(isAgent, initialView);

  // Listen for view-change messages from the parent admin shell.
  useEffect(() => {
    if (!isEmbedded) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "crm:setView") {
        const v = e.data.view as View;
        if (v === "contacts" || v === "companies" || v === "deals") {
          crmState.setView(v);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEmbedded, crmState]);

  return (
    <CrmContext.Provider value={crmState}>
      <div class="layout">
        {!isEmbedded && <Sidebar />}
        <main class="main-content">
          <DataTable />
        </main>
      </div>
      <ErrorBanner />
    </CrmContext.Provider>
  );
}
