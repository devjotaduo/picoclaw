import { launcherFetch } from "@/api/http"

export interface MemoryFile {
  name: string
  path: string
  size: number
  updated_at: string
  backup_count: number
}

export interface MemoryListResponse {
  workspace: string
  files: MemoryFile[]
}

export interface MemoryDetail {
  name: string
  path: string
  content: string
  size: number
  updated_at: string
}

export interface MemoryWriteResponse {
  name: string
  size: number
  updated_at: string
  backup_path?: string
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function listMemoryFiles(): Promise<MemoryListResponse> {
  const res = await launcherFetch("/api/workspace/memory")
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<MemoryListResponse>
}

export async function getMemoryFile(name: string): Promise<MemoryDetail> {
  const res = await launcherFetch(
    `/api/workspace/memory/${encodeURIComponent(name)}`,
  )
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<MemoryDetail>
}

export async function saveMemoryFile(
  name: string,
  content: string,
): Promise<MemoryWriteResponse> {
  const res = await launcherFetch(
    `/api/workspace/memory/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  )
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<MemoryWriteResponse>
}
