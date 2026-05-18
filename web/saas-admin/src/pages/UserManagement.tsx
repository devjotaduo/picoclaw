import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, ShieldCheck } from "lucide-react";
import { listUsers, invitePlatformAdmin, type PlatformUser } from "@/api/platform";
import { SkeletonRow } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, relativeTime } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
      : status === "invited"
        ? "bg-amber-950/60 text-amber-300 border-amber-800"
        : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>
  );
}

export function UserManagement() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["platform-users"], queryFn: listUsers });
  const users: PlatformUser[] = q.data?.users ?? [];

  const invite = useMutation({
    mutationFn: () => invitePlatformAdmin(inviteEmail.trim()),
    onSuccess: (data) => {
      setInviteEmail("");
      setShowInvite(false);
      setInviteToken(data.token);
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      toast({ type: "success", message: "Invite created — share the token below." });
    },
    onError: (e) => toast({ type: "error", message: `Error: ${e.message}` }),
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-xs text-zinc-500">All platform users · platform admins can access this panel</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
        >
          <UserPlus className="h-4 w-4" />
          Invite platform admin
        </button>
      </header>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Platform role</th>
              <th className="px-4 py-2.5 text-left font-medium">Joined</th>
              <th className="px-4 py-2.5 text-left font-medium">Last login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {q.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              : users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-200">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      {u.platform_role ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                          <ShieldCheck className="h-3 w-3" />
                          {u.platform_role}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{relativeTime(u.last_login)}</td>
                  </tr>
                ))}
            {!q.isLoading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-600">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onClose={() => setShowInvite(false)} title="Invite platform admin">
        <p className="mb-3 text-xs text-zinc-400">
          The invited user will receive a one-time invite token granting platform admin access.
        </p>
        <input
          type="email"
          placeholder="admin@example.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="mb-4 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowInvite(false)}
            className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={() => invite.mutate()}
            disabled={!inviteEmail.trim() || invite.isPending}
            className="rounded bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </Dialog>

      {/* One-time token dialog */}
      <Dialog open={!!inviteToken} onClose={() => setInviteToken(null)} title="Invite token">
        <p className="mb-2 text-xs text-amber-300">
          Save this token now — it will not be shown again.
        </p>
        <code className="block break-all rounded bg-zinc-900 p-3 text-xs text-zinc-200">
          {inviteToken}
        </code>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setInviteToken(null)}
            className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Done
          </button>
        </div>
      </Dialog>
    </div>
  );
}
