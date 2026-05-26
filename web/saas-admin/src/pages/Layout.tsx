import { Outlet } from "react-router-dom";

import { AppLayout } from "@/components/app-layout";

export type CrmView = "contacts" | "companies" | "deals";

export function Layout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
