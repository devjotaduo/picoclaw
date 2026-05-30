import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/pages/Layout";
import { Login } from "@/pages/Login";
import { TenantsList } from "@/pages/TenantsList";
import { TenantsDiscovery } from "@/pages/TenantsDiscovery";
import { TenantDetail } from "@/pages/TenantDetail";
import { NewTenant } from "@/pages/NewTenant";
import { SkillsList } from "@/pages/SkillsList";
import { SkillEdit } from "@/pages/SkillEdit";
import { AgentEdit } from "@/pages/AgentEdit";
import { AgentSettings } from "@/pages/AgentSettings";
import { CrmPage } from "@/pages/CrmPage";
import { AcceptInvite } from "@/pages/AcceptInvite";
import { Workspaces } from "@/pages/Workspaces";
import { WorkspaceFiles } from "@/pages/WorkspaceFiles";
import WorkspaceMcp from "@/pages/WorkspaceMcp";
import { TenantFiles } from "@/pages/TenantFiles";
import { AuditLog } from "@/pages/AuditLog";
import { TenantLogs } from "@/pages/TenantLogs";
import { UserManagement } from "@/pages/UserManagement";
import { PlatformDashboard } from "@/pages/PlatformDashboard";
import { PlatformLiteLLM } from "@/pages/PlatformLiteLLM";
import { ServerHealth } from "@/pages/ServerHealth";
import { ChangePassword } from "@/pages/ChangePassword";
import { Shortlinks } from "@/pages/Shortlinks";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status.state === "loading") {
    return <div className="flex h-full items-center justify-center text-zinc-500">Loading…</div>;
  }
  if (status.state === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequirePlatform({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status.state !== "authenticated" || status.me.platform_role !== "platform_admin") {
    return <Navigate to="/tenants" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { status } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={status.state === "authenticated" ? <Navigate to="/tenants" replace /> : <Login />}
      />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/tenants" element={<TenantsList />} />
        <Route path="/tenants/discovery" element={<RequirePlatform><TenantsDiscovery /></RequirePlatform>} />
        <Route path="/tenants/new" element={<RequirePlatform><NewTenant /></RequirePlatform>} />
        <Route path="/tenants/:id" element={<TenantDetail />} />
        <Route path="/tenants/:id/settings" element={<AgentSettings />} />
        <Route path="/tenants/:id/agent" element={<AgentEdit />} />
        <Route path="/tenants/:id/files" element={<RequirePlatform><TenantFiles /></RequirePlatform>} />
        <Route path="/tenants/:id/skills" element={<SkillsList />} />
        <Route path="/tenants/:id/skills/:name" element={<SkillEdit />} />
        <Route path="/tenants/:id/logs" element={<RequirePlatform><TenantLogs /></RequirePlatform>} />
        <Route path="/workspaces" element={<RequirePlatform><Workspaces /></RequirePlatform>} />
        <Route path="/workspaces/:id/files" element={<RequirePlatform><WorkspaceFiles /></RequirePlatform>} />
        <Route path="/workspaces/:id/mcp" element={<RequirePlatform><WorkspaceMcp /></RequirePlatform>} />
        <Route path="/audit" element={<RequirePlatform><AuditLog /></RequirePlatform>} />
        <Route path="/users" element={<RequirePlatform><UserManagement /></RequirePlatform>} />
        <Route path="/dashboard" element={<RequirePlatform><PlatformDashboard /></RequirePlatform>} />
        <Route path="/server-health" element={<RequirePlatform><ServerHealth /></RequirePlatform>} />
        <Route path="/platform/litellm" element={<RequirePlatform><PlatformLiteLLM /></RequirePlatform>} />
        <Route path="/shortlinks" element={<RequirePlatform><Shortlinks /></RequirePlatform>} />
        <Route path="/account/password" element={<ChangePassword />} />
        <Route path="/crm" element={<RequirePlatform><Navigate to="/crm/contacts" replace /></RequirePlatform>} />
        <Route path="/crm/:view" element={<RequirePlatform><CrmPage /></RequirePlatform>} />
        <Route path="/" element={<Navigate to="/tenants" replace />} />
        <Route path="*" element={<Navigate to="/tenants" replace />} />
      </Route>
    </Routes>
  );
}
