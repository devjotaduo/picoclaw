import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CopyableField } from "@/components/ui/copyable-field";

// ResendCredentialsDialog renders the result of POST
// /api/v1/tenants/{id}/resend-credentials: dashboard URL, login email,
// freshly-rotated password, and optionally a short magic link (Supabase
// legacy tenants only). Extracted from TenantDetail.tsx so the page
// doesn't accumulate 100+ JSX lines per admin action.

export type ResendCredentialsData = {
  sent_to: string;
  dashboard_url: string;
  initial_password: string;
  magic_link: string;
  short_magic_link: string;
  magic_link_in_email: boolean;
};

export function ResendCredentialsDialog(props: {
  open: boolean;
  onClose: () => void;
  data: ResendCredentialsData | null;
}) {
  const { open, onClose, data } = props;
  return (
    <Dialog open={open} onClose={onClose} title="Credenciais reenviadas" size="md">
      {data && (
        <div className="space-y-4 text-sm">
          <p className="text-emerald-300">
            Email enviado para <strong>{data.sent_to}</strong>. Se demorar chegar
            (ou cair no spam), copie a senha e o link daqui mesmo.
          </p>

          <CopyableField label="URL do painel" value={data.dashboard_url} />
          <CopyableField label="Email de login" value={data.sent_to} />
          <CopyableField
            label="Senha nova"
            value={data.initial_password}
            warning="A senha anterior parou de funcionar agora."
          />

          {data.magic_link && (
            <>
              {data.short_magic_link && (
                <CopyableField
                  label="Link curto (WhatsApp / SMS · 24h)"
                  value={data.short_magic_link}
                  accent="emerald"
                  hint="Redirect 302 → magic link Supabase. Expira em 24h. Bom pra compartilhar por canais com limite de caracteres."
                />
              )}
              <CopyableField
                label="Magic link completo (Supabase)"
                value={data.magic_link}
                variant="tight"
              />
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
