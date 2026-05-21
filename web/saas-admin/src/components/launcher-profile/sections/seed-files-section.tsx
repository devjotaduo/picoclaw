import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  deleteLauncherProfileSeedFile,
  listLauncherProfileSeedFiles,
  uploadLauncherProfileSeedFile,
  type LauncherProfileSeedFile,
} from "@/api/launcher-profiles";
import { Field } from "@/components/shared-form";
import { SectionCard } from "@/components/launcher-profile/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SeedFilesSectionProps {
  profileId: string;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function defaultPath(file: File | null): string {
  if (!file) return "";
  return file.name.replaceAll("\\", "/").replace(/^\/+/, "");
}

function hasExactConfig(files: LauncherProfileSeedFile[]): boolean {
  return files.some((file) => file.path === "config.json" && file.exact);
}

export function SeedFilesSection({ profileId }: SeedFilesSectionProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState("");
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filesQ = useQuery({
    queryKey: ["launcher-profile-seed-files", profileId],
    queryFn: () => listLauncherProfileSeedFiles(profileId),
  });
  const files = filesQ.data?.files ?? [];
  const configExact = useMemo(() => hasExactConfig(files), [files]);

  const uploadM = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Selecione um arquivo.");
      if (!path.trim()) throw new Error("Informe o caminho no tenant.");
      return uploadLauncherProfileSeedFile({
        id: profileId,
        path: path.trim(),
        file,
        confirmSensitive,
      });
    },
    onSuccess: async () => {
      setFile(null);
      setPath("");
      setConfirmSensitive(false);
      setErrorMessage(null);
      if (inputRef.current) inputRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["launcher-profile-seed-files", profileId] });
    },
    onError: (err) => {
      setErrorMessage((err as { error?: string; message?: string }).error ?? (err as Error).message);
    },
  });

  const deleteM = useMutation({
    mutationFn: (targetPath: string) => deleteLauncherProfileSeedFile(profileId, targetPath),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["launcher-profile-seed-files", profileId] });
    },
  });

  return (
    <SectionCard
      title="Arquivos provisionados"
      description="Arquivos enviados aqui são copiados para todo novo tenant criado com este perfil."
    >
      <div className="space-y-4 py-4">
        <div className="rounded-md border border-amber-700/50 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Arquivos sensíveis são permitidos, mas serão copiados para novos tenants.
              O provisionamento sempre força WhatsApp Nativo ativo no final.
            </p>
          </div>
        </div>

        {configExact && (
          <div className="rounded-md border border-brand-700/50 bg-brand-950/30 p-3 text-xs text-brand-100">
            Existe um <span className="font-mono">config.json</span> enviado como arquivo exato.
            Modelos e chaves serão preservados; somente o WhatsApp Nativo será normalizado.
          </div>
        )}

        <Field
          label="Enviar arquivo"
          hint="Exemplos de caminho: config.json, auth.json, openrouter.key, workspace/AGENT.md"
        >
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              ref={inputRef}
              type="file"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setPath((current) => current || defaultPath(next));
              }}
            />
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="Caminho no tenant"
            />
            <Button
              type="button"
              onClick={() => uploadM.mutate()}
              disabled={uploadM.isPending || !file || !path.trim()}
            >
              {uploadM.isPending ? <Upload className="size-4 animate-pulse" /> : <FileUp className="size-4" />}
              Enviar
            </Button>
          </div>
          <label className="mt-2 flex items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmSensitive}
              onChange={(event) => setConfirmSensitive(event.target.checked)}
            />
            Confirmo que arquivos sensíveis podem ser copiados para novos tenants.
          </label>
          {file && (
            <p className="mt-1 text-[11px] text-zinc-500">
              Selecionado: {file.name} · {formatBytes(file.size)}
            </p>
          )}
          {errorMessage && <p className="mt-2 text-xs text-red-400">{errorMessage}</p>}
        </Field>

        <div className="overflow-hidden rounded-md border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Caminho</th>
                <th className="px-3 py-2 font-medium">Tamanho</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {files.map((item) => (
                <tr key={item.path} className="bg-zinc-900/30">
                  <td className="px-3 py-2 font-mono text-zinc-200">{item.path}</td>
                  <td className="px-3 py-2 text-zinc-400">{formatBytes(item.size)}</td>
                  <td className="px-3 py-2">
                    {item.sensitive ? (
                      <span className="rounded bg-amber-950 px-2 py-1 text-amber-200">sensível</span>
                    ) : (
                      <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">arquivo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remover arquivo"
                      onClick={() => deleteM.mutate(item.path)}
                      disabled={deleteM.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filesQ.isLoading && files.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                    Nenhum arquivo enviado.
                  </td>
                </tr>
              )}
              {filesQ.isLoading && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                    Carregando arquivos...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
