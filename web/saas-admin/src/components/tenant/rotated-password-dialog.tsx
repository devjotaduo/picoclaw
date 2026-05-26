import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CopyableField } from "@/components/ui/copyable-field";

// RotatedPasswordDialog is the simpler sibling of ResendCredentialsDialog:
// shown after POST /api/v1/tenants/{id}/rotate-password, which mints a
// new password but doesn't email it. Operator copies, hands off through
// whatever side channel they prefer. Closeable=false so a fat-finger on
// the backdrop doesn't lose the only chance to grab the password.

export function RotatedPasswordDialog(props: {
  password: string | null;
  onClose: () => void;
}) {
  const { password, onClose } = props;
  return (
    <Dialog open={!!password} onClose={onClose} title="Senha nova" size="md">
      {password && (
        <div className="space-y-3 text-sm">
          <p className="text-amber-300">Guarde esta senha agora: ela não será exibida novamente.</p>
          <CopyableField label="Senha" value={password} />
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
