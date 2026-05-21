import { launcherFetch } from "@/api/http"

export interface CronJobSchedule {
  kind: string
  atMs?: number
  everyMs?: number
  expr?: string
  tz?: string
}

export interface CronJobPayload {
  kind: string
  message: string
  command?: string
  channel?: string
  to?: string
  agent_id?: string
}

export interface CronJobState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastStatus?: string
  lastError?: string
}

export interface CronJob {
  id: string
  name: string
  enabled: boolean
  schedule: CronJobSchedule
  payload: CronJobPayload
  state: CronJobState
  createdAtMs: number
  updatedAtMs: number
  deleteAfterRun: boolean
}

export interface CronJobsResponse {
  workspace: string
  store_path: string
  jobs: CronJob[]
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function listCronJobs(): Promise<CronJobsResponse> {
  const res = await launcherFetch("/api/cron/jobs")
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<CronJobsResponse>
}
