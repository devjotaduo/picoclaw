import { api } from "./client";

export type CompanyIntakeStatus = "draft" | "report_ready" | "submitted" | "reviewed" | "linked";

export type CompanyIntakeAttachment = {
  id: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  uploaded_at: string;
};

export type CompanyIntake = {
  id: string;
  resume_token?: string;
  status: CompanyIntakeStatus;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_whatsapp: string;
  answers: Record<string, unknown>;
  attachments: CompanyIntakeAttachment[];
  audio_transcript?: string;
  report?: Record<string, unknown>;
  public_summary?: Record<string, unknown>;
  linked_tenant_id?: string | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  // Phase 10 polling-bridge fields. Surfaced by the public GET endpoint
  // so useOnboardingIntakePolling can synthesize the legacy SSE events
  // (qualified, tenant_provisioned) when the chat runs in the public
  // onboarding tenant.
  qualified_at?: string | null;
  tenant_url?: string;
  tenant_subdomain?: string;
  tenant_login_mode?: "password" | "magic_link" | string;
};

export async function createPublicIntake() {
  return api<CompanyIntake>("/api/v1/public/company-intakes", {
    method: "POST",
    body: JSON.stringify({ source: "pre-cadastro" }),
  });
}

export async function getPublicIntake(id: string, resumeToken: string) {
  return api<CompanyIntake>(
    `/api/v1/public/company-intakes/${encodeURIComponent(id)}?resume_token=${encodeURIComponent(resumeToken)}`,
  );
}

export async function savePublicIntake(input: {
  id: string;
  resume_token: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_whatsapp: string;
  answers: Record<string, unknown>;
  audio_transcript?: string;
}) {
  return api<CompanyIntake>(`/api/v1/public/company-intakes/${encodeURIComponent(input.id)}/answers`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function uploadPublicIntakeAttachment(input: {
  id: string;
  resume_token: string;
  kind: string;
  file: File;
}) {
  const form = new FormData();
  form.set("resume_token", input.resume_token);
  form.set("kind", input.kind);
  form.set("file", input.file);
  const resp = await fetch(`/api/v1/public/company-intakes/${encodeURIComponent(input.id)}/attachments`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw { error: body.error ?? `HTTP ${resp.status}`, status: resp.status };
  return body as CompanyIntake;
}

export async function savePublicIntakeTranscript(id: string, resumeToken: string, transcript: string) {
  return api<CompanyIntake>(`/api/v1/public/company-intakes/${encodeURIComponent(id)}/audio-transcript`, {
    method: "POST",
    body: JSON.stringify({ resume_token: resumeToken, transcript }),
  });
}

export async function generatePublicIntakeReport(id: string, resumeToken: string) {
  return api<CompanyIntake>(`/api/v1/public/company-intakes/${encodeURIComponent(id)}/report`, {
    method: "POST",
    body: JSON.stringify({ resume_token: resumeToken }),
  });
}

export type SubmittedIntake = CompanyIntake & {
  // Optional provisioning result added by the backend when
  // PICOCLAW_SAAS_AUTO_PROVISION=true and the intake has email + company.
  tenant_provisioned?: boolean;
  tenant_already_exists?: boolean;
  provision_error?: string;
  url?: string;
  subdomain?: string;
  login_mode?: "magic_link" | "password";
  check_email?: boolean;
  initial_password?: string;
};

export async function submitPublicIntake(id: string, resumeToken: string) {
  return api<SubmittedIntake>(`/api/v1/public/company-intakes/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: JSON.stringify({ resume_token: resumeToken }),
  });
}

export async function listCompanyIntakes(status = "all") {
  return api<{ intakes: CompanyIntake[] }>(`/api/v1/company-intakes?status=${encodeURIComponent(status)}`);
}

export async function getCompanyIntake(id: string) {
  return api<CompanyIntake>(`/api/v1/company-intakes/${encodeURIComponent(id)}`);
}

export async function updateCompanyIntakeStatus(id: string, status: CompanyIntakeStatus) {
  return api<CompanyIntake>(`/api/v1/company-intakes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function linkCompanyIntakeTenant(id: string, tenantId: string) {
  return api<CompanyIntake>(`/api/v1/company-intakes/${encodeURIComponent(id)}/link-tenant`, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

export function attachmentDownloadUrl(intakeId: string, attachmentId: string) {
  return `/api/v1/company-intakes/${encodeURIComponent(intakeId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
