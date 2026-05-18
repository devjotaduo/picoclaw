import { Save } from "lucide-react";

import { ConfigChangeNotice } from "@/components/config-change-notice";
import { Button } from "@/components/ui/button";

interface DirtyBarProps {
  dirty: boolean;
  saving: boolean;
  errorMessage?: string;
  onReset: () => void;
  onSave: () => void;
}

export function DirtyBar({ dirty, saving, errorMessage, onReset, onSave }: DirtyBarProps) {
  if (!dirty && !errorMessage) return null;
  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-3 py-3 shadow-[0_-12px_30px_rgba(0,0,0,0.5)] backdrop-blur lg:px-6">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          {errorMessage ? (
            <ConfigChangeNotice kind="error" title="Erro ao salvar" description={errorMessage} />
          ) : (
            <ConfigChangeNotice
              kind="save"
              title="Alterações não salvas"
              description="Revise as mudanças e clique em Salvar para aplicar ao perfil."
            />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={onSave} disabled={!dirty || saving}>
            <Save className="size-4" />
            {saving ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </div>
    </div>
  );
}
