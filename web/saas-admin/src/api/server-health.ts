import { api } from "./client";

export interface HostHealth {
  hostname: string;
  uptime_sec: number;
  load_1: number;
  load_5: number;
  load_15: number;
  cpu_count: number;
  mem_total_kb: number;
  mem_free_kb: number;
  mem_available_kb: number;
  swap_total_kb: number;
  swap_free_kb: number;
  kernel: string;
}

export interface ProcessHealth {
  uptime_sec: number;
  go_version: string;
  num_goroutine: number;
  alloc_bytes: number;
  sys_bytes: number;
  num_gc: number;
  pid: number;
}

export interface DiskHealth {
  path: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_pct: number;
  available: boolean;
}

export interface DockerHealth {
  reachable: boolean;
  error?: string;
  api_version?: string;
  server_version?: string;
  operating_system?: string;
  storage_driver?: string;
  ncpu?: number;
  mem_total?: number;
  containers_all?: number;
  containers_running?: number;
  containers_stopped?: number;
  images?: number;
}

export interface TenantHealthCounts {
  active: number;
  suspended: number;
  errors: number;
  managed_containers: number;
  managed_running: number;
  managed_stopped: number;
}

export interface ContainerHealth {
  name: string;
  tenant_id: string;
  running: boolean;
}

export interface ServerHealth {
  now: string;
  host: HostHealth;
  process: ProcessHealth;
  disks: DiskHealth[];
  docker: DockerHealth;
  tenants: TenantHealthCounts;
  containers: ContainerHealth[];
}

export async function getServerHealth(): Promise<ServerHealth> {
  return api<ServerHealth>("/api/v1/platform/server-health");
}
