import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDotsVertical,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";

import { deleteTenant, listTenants, type Tenant } from "@/api/tenants";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonRow } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { formatUSD, relativeTime } from "@/lib/utils";

type TenantStatus = "all" | "active" | "suspended" | "error" | "provisioning" | "deleting";

const VALID_STATUSES: TenantStatus[] = ["all", "active", "suspended", "error", "provisioning", "deleting"];
const BULK_DELETE_CONFIRM = "EXCLUIR";

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "error", label: "Erro" },
  { value: "provisioning", label: "Preparando" },
  { value: "deleting", label: "Excluindo" },
];

function isValidStatus(v: string | null): v is TenantStatus {
  return v !== null && (VALID_STATUSES as string[]).includes(v);
}

interface BulkDeleteFailure {
  tenant: Tenant;
  message: string;
}

interface BulkDeleteResult {
  deleted: Tenant[];
  failed: BulkDeleteFailure[];
}

export function TenantsList() {
  const { status } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = useQuery({ queryKey: ["tenants"], queryFn: listTenants, refetchInterval: 15_000 });
  const tenants = q.data?.tenants ?? [];
  const isPlatformAdmin =
    status.state === "authenticated" && status.me.platform_role === "platform_admin";

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");

  const deleteM = useMutation({
    mutationFn: (tenant: Tenant) => deleteTenant(tenant.id),
    onSuccess: async (_res, tenant) => {
      setDeleteTarget(null);
      setDeleteConfirm("");
      setSelectedTenantIds((current) => {
        const next = new Set(current);
        next.delete(tenant.id);
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      toast({ type: "success", message: `${tenant.subdomain} excluído.` });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao excluir cliente." }),
  });

  const bulkDeleteM = useMutation({
    mutationFn: async (targets: Tenant[]): Promise<BulkDeleteResult> => {
      const deleted: Tenant[] = [];
      const failed: BulkDeleteFailure[] = [];

      for (const tenant of targets) {
        try {
          await deleteTenant(tenant.id);
          deleted.push(tenant);
        } catch (error) {
          failed.push({ tenant, message: getErrorMessage(error) });
        }
      }

      return { deleted, failed };
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      setBulkDeleteConfirm("");
      setBulkDeleteOpen(false);

      if (result.failed.length > 0) {
        setSelectedTenantIds(new Set(result.failed.map((item) => item.tenant.id)));
        toast({
          type: "error",
          message: `${result.deleted.length} excluídos; ${result.failed.length} falharam.`,
        });
        return;
      }

      setSelectedTenantIds(new Set());
      toast({
        type: "success",
        message: `${result.deleted.length} cliente${result.deleted.length === 1 ? "" : "s"} excluído${result.deleted.length === 1 ? "" : "s"}.`,
      });
    },
  });

  const rawStatus = searchParams.get("status");
  const statusFilter: TenantStatus = isValidStatus(rawStatus) ? rawStatus : "all";

  const filtered = tenants.filter((t) => {
    const term = search.toLowerCase();
    const matchSearch =
      !term ||
      t.subdomain.includes(term) ||
      t.owner_email.toLowerCase().includes(term) ||
      (t.display_name?.toLowerCase().includes(term) ?? false);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });
  const selectableFiltered = filtered.filter((t) => t.status !== "deleting");
  const selectedTenants = tenants.filter((t) => selectedTenantIds.has(t.id));
  const bulkDeleteTargets = selectedTenants.filter((t) => t.status !== "deleting");
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((t) => selectedTenantIds.has(t.id));
  const someFilteredSelected =
    !allFilteredSelected && selectableFiltered.some((t) => selectedTenantIds.has(t.id));
  const tableColumnCount = isPlatformAdmin ? 10 : 9;

  const handleStatusFilterChange = (value: TenantStatus) => {
    setSearchParams(value === "all" ? {} : { status: value }, { replace: true });
  };

  const clearFilters = () => {
    setSearch("");
    setSearchParams({}, { replace: true });
  };

  const closeDeleteDialog = () => {
    if (deleteM.isPending) return;
    setDeleteTarget(null);
    setDeleteConfirm("");
  };

  const closeBulkDeleteDialog = () => {
    if (bulkDeleteM.isPending) return;
    setBulkDeleteOpen(false);
    setBulkDeleteConfirm("");
  };

  const handleToggleTenantSelection = (tenant: Tenant, checked: boolean) => {
    if (tenant.status === "deleting") return;
    setSelectedTenantIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(tenant.id);
      } else {
        next.delete(tenant.id);
      }
      return next;
    });
  };

  const handleToggleFilteredSelection = (checked: boolean) => {
    setSelectedTenantIds((current) => {
      const next = new Set(current);
      for (const tenant of selectableFiltered) {
        if (checked) {
          next.add(tenant.id);
        } else {
          next.delete(tenant.id);
        }
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Clientes"
        description={
          q.isLoading
            ? "Carregando clientes..."
            : filtered.length === tenants.length
              ? `${tenants.length} total`
              : `${filtered.length} de ${tenants.length}`
        }
      >
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <IconRefresh data-icon="inline-start" className={q.isFetching ? "animate-spin" : undefined} />
          Atualizar
        </Button>
        {isPlatformAdmin ? (
          <Button size="sm" asChild>
            <Link to="/tenants/new">
              <IconPlus data-icon="inline-start" />
              Novo cliente
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-[1fr_240px]">
          <Field>
            <FieldLabel className="sr-only" htmlFor="tenant-search">Buscar cliente</FieldLabel>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tenant-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por endereço, email ou nome..."
                className="pl-8"
              />
            </div>
          </Field>
          <Field>
            <FieldLabel className="sr-only">Status</FieldLabel>
            <Select value={statusFilter} onValueChange={(value) => handleStatusFilterChange(value as TenantStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {q.isError ? (
          <Alert className="border-destructive/40 bg-destructive/10">
            <AlertDescription>Falha ao carregar clientes.</AlertDescription>
          </Alert>
        ) : null}

        {isPlatformAdmin && selectedTenants.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div className="text-sm">
              <span className="font-medium">{selectedTenants.length}</span>{" "}
              cliente{selectedTenants.length === 1 ? "" : "s"} selecionado{selectedTenants.length === 1 ? "" : "s"}
              {bulkDeleteTargets.length !== selectedTenants.length ? (
                <span className="ml-2 text-muted-foreground">
                  ({selectedTenants.length - bulkDeleteTargets.length} já em exclusão)
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedTenantIds(new Set())}
                disabled={bulkDeleteM.isPending}
              >
                Limpar seleção
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkDeleteTargets.length === 0 || bulkDeleteM.isPending}
              >
                <IconTrash data-icon="inline-start" />
                Excluir selecionados
              </Button>
            </div>
          </div>
        ) : null}

        {!q.isLoading && tenants.length === 0 ? (
          <Empty>
            <EmptyTitle>Nenhum cliente ainda</EmptyTitle>
            <EmptyDescription>Crie o primeiro cliente com modelo base e pacote de acesso em um único fluxo.</EmptyDescription>
            {isPlatformAdmin ? (
              <Button size="sm" asChild>
                <Link to="/tenants/new">
                  <IconPlus data-icon="inline-start" />
                  Criar primeiro cliente
                </Link>
              </Button>
            ) : null}
          </Empty>
        ) : null}

        {!q.isLoading && tenants.length > 0 && filtered.length === 0 ? (
          <Empty>
            <EmptyTitle>Nenhum cliente combina com o filtro</EmptyTitle>
            <EmptyDescription>Ajuste a busca ou limpe os filtros aplicados.</EmptyDescription>
            <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
          </Empty>
        ) : null}

        {(q.isLoading || filtered.length > 0) ? (
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {isPlatformAdmin ? (
                    <TableHead className="w-10">
                      <SelectionCheckbox
                        checked={allFilteredSelected}
                        indeterminate={someFilteredSelected}
                        disabled={selectableFiltered.length === 0 || q.isLoading}
                        ariaLabel="Selecionar clientes filtrados"
                        onChange={handleToggleFilteredSelection}
                      />
                    </TableHead>
                  ) : null}
                  <TableHead>Endereço</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Limite/mês</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <>
                    <SkeletonRow cols={tableColumnCount} />
                    <SkeletonRow cols={tableColumnCount} />
                    <SkeletonRow cols={tableColumnCount} />
                    <SkeletonRow cols={tableColumnCount} />
                    <SkeletonRow cols={tableColumnCount} />
                  </>
                ) : null}
                {filtered.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => nav(`/tenants/${t.id}`)}>
                    {isPlatformAdmin ? (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <SelectionCheckbox
                          checked={selectedTenantIds.has(t.id)}
                          disabled={t.status === "deleting" || deleteM.isPending || bulkDeleteM.isPending}
                          ariaLabel={`Selecionar ${t.subdomain}`}
                          onChange={(checked) => handleToggleTenantSelection(t, checked)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        to={`/tenants/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.subdomain}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">{t.id}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.display_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.owner_email || "—"}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className="font-mono text-[10px] uppercase tracking-wide">
                          {t.auth_backend}
                        </Badge>
                        {t.is_public ? (
                          <Badge className="border-chart-1/30 bg-chart-1/10 text-chart-1">public</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatUSD(t.monthly_budget_usd)}</TableCell>
                    <TableCell className="text-muted-foreground">{relativeTime(t.created_at)}</TableCell>
                    <TableCell>
                      {t.initial_password_delivered ? (
                        <Badge className="border-chart-2/30 bg-chart-2/10 text-chart-2">entregue</Badge>
                      ) : (
                        <Badge className="border-chart-3/30 bg-chart-3/10 text-chart-3">pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isPlatformAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${t.subdomain}`}>
                              <IconDotsVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={t.status === "deleting"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(t);
                                setDeleteConfirm("");
                              }}
                            >
                              <IconTrash data-icon="inline-start" />
                          Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      <Dialog open={!!deleteTarget} onClose={closeDeleteDialog} title="Excluir cliente?" size="sm" closable={!deleteM.isPending}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4 text-sm">
            <Alert className="border-destructive/40 bg-destructive/10">
              <AlertDescription>
                Isso remove a área do cliente, os arquivos vinculados e os registros da Jota Duo relacionados.
              </AlertDescription>
            </Alert>
            <Field>
              <FieldLabel htmlFor="delete-confirm">Digite {deleteTarget.subdomain}</FieldLabel>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteM.isPending}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => deleteM.mutate(deleteTarget)}
                disabled={deleteConfirm !== deleteTarget.subdomain || deleteM.isPending}
              >
                {deleteM.isPending ? "Excluindo..." : "Excluir definitivamente"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={bulkDeleteOpen}
        onClose={closeBulkDeleteDialog}
        title={`Excluir ${bulkDeleteTargets.length} cliente${bulkDeleteTargets.length === 1 ? "" : "s"}?`}
        size="md"
        closable={!bulkDeleteM.isPending}
      >
        <div className="flex flex-col gap-4 text-sm">
          <Alert className="border-destructive/40 bg-destructive/10">
            <AlertDescription>
              Isso executa a exclusão definitiva de cada cliente selecionado, incluindo arquivos vinculados e registros relacionados.
            </AlertDescription>
          </Alert>

          <div className="max-h-52 overflow-auto rounded-lg border bg-background">
            <ul className="divide-y divide-border/60">
              {bulkDeleteTargets.map((tenant) => (
                <li key={tenant.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{tenant.subdomain}</span>
                    <span className="block truncate text-xs text-muted-foreground">{tenant.owner_email || tenant.id}</span>
                  </span>
                  <StatusBadge status={tenant.status} />
                </li>
              ))}
            </ul>
          </div>

          <Field>
            <FieldLabel htmlFor="bulk-delete-confirm">Digite {BULK_DELETE_CONFIRM}</FieldLabel>
            <Input
              id="bulk-delete-confirm"
              value={bulkDeleteConfirm}
              onChange={(e) => setBulkDeleteConfirm(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeBulkDeleteDialog} disabled={bulkDeleteM.isPending}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => bulkDeleteM.mutate(bulkDeleteTargets)}
              disabled={
                bulkDeleteTargets.length === 0 ||
                bulkDeleteConfirm !== BULK_DELETE_CONFIRM ||
                bulkDeleteM.isPending
              }
            >
              {bulkDeleteM.isPending ? "Excluindo..." : "Excluir em massa"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  ariaLabel,
  onChange,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "error" in error) {
    const maybeError = (error as { error?: unknown }).error;
    if (typeof maybeError === "string") {
      return maybeError;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Falha desconhecida";
}
