import { useState } from "react";
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

  const deleteM = useMutation({
    mutationFn: (tenant: Tenant) => deleteTenant(tenant.id),
    onSuccess: async (_res, tenant) => {
      setDeleteTarget(null);
      setDeleteConfirm("");
      await qc.invalidateQueries({ queryKey: ["tenants"] });
      toast({ type: "success", message: `${tenant.subdomain} excluído.` });
    },
    onError: (e: { error?: string }) => toast({ type: "error", message: e?.error ?? "Falha ao excluir cliente." }),
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
                    <SkeletonRow cols={9} />
                    <SkeletonRow cols={9} />
                    <SkeletonRow cols={9} />
                    <SkeletonRow cols={9} />
                    <SkeletonRow cols={9} />
                  </>
                ) : null}
                {filtered.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => nav(`/tenants/${t.id}`)}>
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
    </div>
  );
}
