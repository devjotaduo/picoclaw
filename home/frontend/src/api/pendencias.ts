import { launcherFetch } from "@/api/http"

export interface PendenciaItem {
  file: string
  line: number
  heading?: string
  text: string
}

export interface PendenciasResponse {
  workspace: string
  items: PendenciaItem[]
  total_by_file: Record<string, number>
}

async function asError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.trim() || `API error: ${res.status}`
}

export async function listPendencias(): Promise<PendenciasResponse> {
  const res = await launcherFetch("/api/workspace/pendencias")
  if (!res.ok) throw new Error(await asError(res))
  return res.json() as Promise<PendenciasResponse>
}
