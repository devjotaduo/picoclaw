import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Save,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json as jsonLang } from "@codemirror/lang-json";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { javascript } from "@codemirror/lang-javascript";

import {
  getWorkspace,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  type WorkspaceTreeEntry,
} from "@/api/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

// WorkspaceFiles is the inline editor for a workspace's home/ and
// frontend-src/ subtrees. Two-column layout: tree on the left, CodeMirror
// editor on the right. Reads + writes go through the existing
// /api/v1/workspaces/{id}/files endpoints (the tree endpoint is the only
// new backend route).
//
// MVP scope (deliberately):
//   - Browse the tree (read-only navigation; no rename/delete/create)
//   - Open one file at a time in the editor
//   - Edit + save
//   - Visual dirty-state indicator + unload guard
//
// Out of scope for MVP: create/delete/rename, binary upload, multi-file
// editing, diff view, search. Operators can still SSH into the VPS for
// anything beyond text-file editing.

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  isText: boolean;
  children: TreeNode[];
};

function buildTree(entries: WorkspaceTreeEntry[]): TreeNode[] {
  const root: TreeNode = {
    name: "",
    path: "",
    isDir: true,
    size: 0,
    isText: false,
    children: [],
  };
  const index = new Map<string, TreeNode>();
  index.set("", root);

  // Entries come pre-sorted by filepath.Walk (alphabetical, depth-first).
  for (const e of entries) {
    const parts = e.path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = index.get(parentPath);
    if (!parent) {
      // Defensive: parent should always exist due to Walk's traversal order.
      continue;
    }
    const node: TreeNode = {
      name,
      path: e.path,
      isDir: e.is_dir,
      size: e.size,
      isText: e.is_text,
      children: [],
    };
    parent.children.push(node);
    if (e.is_dir) {
      index.set(e.path, node);
    }
  }

  // Sort each level: directories first, then files, both alphabetically.
  const sortRecursive = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRecursive);
  };
  sortRecursive(root);
  return root.children;
}

function languageForPath(path: string) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown":
      return [markdown()];
    case ".json":
      return [jsonLang()];
    case ".yaml":
    case ".yml":
      return [yamlLang()];
    case ".js":
    case ".jsx":
    case ".ts":
    case ".tsx":
    case ".mjs":
    case ".cjs":
      return [javascript({ jsx: ext.endsWith("x"), typescript: ext.startsWith(".t") })];
    default:
      return [];
  }
}

function FileTreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  selectedPath: string | null;
  onSelect: (node: TreeNode) => void;
}) {
  const isExpanded = expanded.has(node.path);
  const isSelected = node.path === selectedPath;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (node.isDir) {
            toggleExpand(node.path);
          } else {
            onSelect(node);
          }
        }}
        className={[
          "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs",
          isSelected ? "bg-blue-500/20 text-blue-100" : "hover:bg-zinc-700/40",
          !node.isText && !node.isDir ? "text-zinc-500 italic" : "",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        title={!node.isText && !node.isDir ? "Binary file — not editable inline" : node.path}
      >
        {node.isDir ? (
          isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        {node.isDir ? (
          isExpanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : node.isText ? (
          <FileText className="h-3.5 w-3.5 shrink-0 text-blue-300" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
        <span className="truncate">{node.name}</span>
        {!node.isDir && (
          <span className="ml-auto shrink-0 text-[10px] text-zinc-500">{humanSize(node.size)}</span>
        )}
      </button>
      {node.isDir && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function humanSize(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

export function WorkspaceFiles() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workspaceId = id ?? "";
  const qc = useQueryClient();

  const wsQuery = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    enabled: !!workspaceId,
  });

  const treeQuery = useQuery({
    queryKey: ["workspace-files-tree", workspaceId],
    queryFn: () => listWorkspaceFiles(workspaceId),
    enabled: !!workspaceId,
  });

  const tree = useMemo(
    () => (treeQuery.data ? buildTree(treeQuery.data.entries) : []),
    [treeQuery.data],
  );

  // Default expand: top-level subtrees (home, frontend-src).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!treeQuery.data) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      treeQuery.data.subtrees.forEach((s) => next.add(s));
      // Also auto-expand home/workspace so AGENT.md/SOUL.md are visible.
      next.add("home/workspace");
      return next;
    });
  }, [treeQuery.data]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [openError, setOpenError] = useState<string | null>(null);

  const fileQuery = useQuery({
    queryKey: ["workspace-file", workspaceId, selectedPath],
    queryFn: () => readWorkspaceFile(workspaceId, selectedPath!),
    enabled: !!selectedPath,
    retry: false,
  });

  useEffect(() => {
    if (!fileQuery.data) return;
    setDraft(fileQuery.data.content);
    setOriginalContent(fileQuery.data.content);
    setOpenError(null);
  }, [fileQuery.data]);

  useEffect(() => {
    if (fileQuery.error) {
      const msg = fileQuery.error instanceof Error ? fileQuery.error.message : "failed to read file";
      setOpenError(msg);
      setDraft("");
      setOriginalContent("");
    }
  }, [fileQuery.error]);

  const isDirty = draft !== originalContent;

  // Browser unload guard so an accidental tab close doesn't lose edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: () => writeWorkspaceFile(workspaceId, selectedPath!, draft),
    onSuccess: () => {
      setOriginalContent(draft);
      // Refresh tree (size may have changed) but keep editor state intact.
      qc.invalidateQueries({ queryKey: ["workspace-files-tree", workspaceId] });
    },
  });

  const selectNode = (n: TreeNode) => {
    if (n.isDir) return;
    if (!n.isText) {
      setSelectedPath(n.path);
      setOpenError("Binary file — not editable inline. Use SSH or a future upload UI to manage.");
      setDraft("");
      setOriginalContent("");
      return;
    }
    if (isDirty) {
      const ok = window.confirm("Você tem alterações não salvas. Descartar e abrir o arquivo selecionado?");
      if (!ok) return;
    }
    setSelectedPath(n.path);
    setOpenError(null);
  };

  const extensions = useMemo(
    () => (selectedPath ? languageForPath(selectedPath) : []),
    [selectedPath],
  );

  if (!workspaceId) {
    return <div className="p-6 text-zinc-400">Workspace id ausente.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={wsQuery.data ? `Editor — ${wsQuery.data.name}` : "Editor de workspace"}
        description="Edite arquivos do workspace direto pelo painel. Mudanças escrevem no host imediatamente; tenants já provisionados a partir deste workspace só pegam o novo conteúdo quando forem recriados."
      >
        <Button variant="outline" size="sm" onClick={() => navigate("/workspaces")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
      </PageHeader>

      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        {/* File tree */}
        <Card className="flex w-72 shrink-0 flex-col overflow-hidden">
          <CardHeader className="border-b border-zinc-800 px-3 py-2">
            <CardTitle className="text-xs uppercase tracking-wider text-zinc-400">Arquivos</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-1">
            {treeQuery.isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Carregando…
              </div>
            ) : treeQuery.error ? (
              <div className="px-2 py-2 text-xs text-red-400">
                {treeQuery.error instanceof Error ? treeQuery.error.message : "falha ao listar"}
              </div>
            ) : tree.length === 0 ? (
              <div className="px-2 py-2 text-xs text-zinc-500">
                Workspace vazio. Importe um template ou crie arquivos via SSH primeiro.
              </div>
            ) : (
              <div>
                {tree.map((node) => (
                  <FileTreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    selectedPath={selectedPath}
                    onSelect={selectNode}
                  />
                ))}
                {treeQuery.data?.truncated && (
                  <div className="mt-2 flex items-center gap-1 px-2 py-1 text-[10px] text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Tree truncada — mais de 5000 entradas.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="flex flex-1 flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-zinc-800 px-3 py-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate font-mono text-xs text-zinc-300">
                {selectedPath ?? "Selecione um arquivo na árvore"}
              </CardTitle>
              {fileQuery.data && (
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {humanSize(fileQuery.data.size)} · mode {fileQuery.data.mode}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isDirty && <span className="text-[10px] text-amber-400">● não salvo</span>}
              {saveMutation.isSuccess && !isDirty && (
                <span className="text-[10px] text-emerald-400">✓ salvo</span>
              )}
              <Button
                size="sm"
                disabled={!selectedPath || !isDirty || saveMutation.isPending || !!openError}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Salvar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {!selectedPath ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                Escolha um arquivo na árvore à esquerda para editar.
              </div>
            ) : openError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-amber-400">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {openError}
              </div>
            ) : fileQuery.isLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Carregando arquivo…
              </div>
            ) : (
              <CodeMirror
                value={draft}
                height="100%"
                theme="dark"
                extensions={extensions}
                onChange={(value) => setDraft(value)}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  autocompletion: false,
                  foldGutter: true,
                  bracketMatching: true,
                  closeBrackets: true,
                }}
                className="h-full text-xs"
              />
            )}
            {saveMutation.isError && (
              <div className="border-t border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                Falha ao salvar:{" "}
                {saveMutation.error instanceof Error ? saveMutation.error.message : "erro desconhecido"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
