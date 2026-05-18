// ClaraFinalize is the single-step conversion screen shown after the Clara
// agent fires the `mark_qualified` tool. We deliberately keep it minimal:
// one card with what was extracted, one form with two fields, one CTA.
//
// The agent has already populated company_name / contact_name / answers via
// tool calls during the conversation, so the only missing pieces are usually
// contact_email and contact_whatsapp. We pre-fill them when the agent caught
// them in passing and skip the visit to the legacy 22-step wizard entirely.

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, AlertCircle, Loader2, Pencil, Check } from "lucide-react";

import {
	savePublicIntake,
	submitPublicIntake,
	type CompanyIntake,
} from "@/api/company-intakes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type ClaraExtracted } from "./useClaraChat";

export type ClaraFinalizeProps = {
	intake: CompanyIntake;
	resumeToken: string;
	extracted: ClaraExtracted;
	qualifiedReason?: string;
	onSubmitted: () => void;
	onBack: () => void;
};

export function ClaraFinalize(props: ClaraFinalizeProps) {
	const initialEmail = (props.intake.contact_email ?? "").trim();
	const initialWhatsApp = maskPhone((props.intake.contact_whatsapp ?? "").trim());

	const [email, setEmail] = useState(initialEmail);
	const [whatsapp, setWhatsApp] = useState(initialWhatsApp);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	// Editable snapshot of what the agent extracted. The form-level changes
	// don't touch the server until the user submits.
	const [editedExtracted, setEditedExtracted] = useState<ClaraExtracted>(props.extracted);

	// Move focus to the first field on mount so keyboard users start typing
	// without a Tab dance (P2.16 ticket).
	const emailInputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		emailInputRef.current?.focus();
	}, []);

	const emailValid = useMemo(() => isValidEmail(email), [email]);
	const whatsappValid = useMemo(() => isValidPhone(whatsapp), [whatsapp]);
	// Require at least one contact channel so the team has a way to follow up.
	const canSubmit = emailValid || whatsappValid;

	const handleSubmit = async () => {
		setError("");
		if (!canSubmit) {
			setError("preencha pelo menos um contato (e-mail ou WhatsApp)");
			return;
		}
		setSubmitting(true);

		// Sanity: if the agent didn't manage to capture identity, fall back to
		// the e-mail local-part / phone as a placeholder name+company so the
		// legacy submit validator doesn't bounce us with a 400.
		const fallbackName = (email || whatsapp).split("@")[0] || "Cliente";
		const companyName =
			props.intake.company_name?.trim() || props.extracted.companyName || fallbackName;
		const contactName =
			props.intake.contact_name?.trim() || props.extracted.contactName || fallbackName;

		// Merge any inline edits from "O que entendi" into answers before
		// submit. Server-side validators expect the legacy keys (offer,
		// business_type, segments, channels, pains, systems).
		const baseAnswers = (props.intake.answers as Record<string, unknown>) ?? {};
		const mergedAnswers: Record<string, unknown> = {
			...baseAnswers,
			...(editedExtracted.segments.length > 0 ? { segments: editedExtracted.segments } : {}),
			...(editedExtracted.channels.length > 0 ? { channels: editedExtracted.channels } : {}),
			...(editedExtracted.pains.length > 0 ? { pains: editedExtracted.pains } : {}),
			...(editedExtracted.systems.length > 0 ? { systems: editedExtracted.systems } : {}),
		};
		// Guarantee the legacy "offer" + "business_type" required by the
		// submit validator even when the agent didn't fill them precisely.
		if (!mergedAnswers.offer) {
			const guess = editedExtracted.segments[0] || "automação";
			mergedAnswers.offer = `${companyName} — ${guess}`.slice(0, 240);
		}
		if (!mergedAnswers.business_type) {
			mergedAnswers.business_type = editedExtracted.segments[0] || "outro";
		}

		try {
			await savePublicIntake({
				id: props.intake.id,
				resume_token: props.resumeToken,
				company_name: companyName,
				contact_name: contactName,
				contact_email: emailValid ? email.trim() : props.intake.contact_email ?? "",
				contact_whatsapp: whatsappValid ? digitsOnly(whatsapp) : props.intake.contact_whatsapp ?? "",
				answers: mergedAnswers,
				audio_transcript: props.intake.audio_transcript ?? "",
			});

			// Retry transient 5xx up to 2 times. 4xx errors get surfaced
			// immediately because they're contract issues, not network blips.
			await retryOn5xx(() => submitPublicIntake(props.intake.id, props.resumeToken), 2);
			props.onSubmitted();
		} catch (err) {
			setError(humanizeSubmitError(err));
			setSubmitting(false);
		}
	};

	const isRetriable = useMemo(() => isProbably5xx(error), [error]);

	// Render guards: don't block submit if extracted is sparse — qualifying
	// already meant the agent thought there was enough.
	return (
		<div className="flex min-h-[100dvh] flex-col bg-zinc-50">
			<header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
				<div className="mx-auto flex max-w-2xl items-center justify-between">
					<div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
						<Sparkles className="h-4 w-4 text-violet-600" />
						Quase lá
					</div>
					<button
						type="button"
						onClick={props.onBack}
						className="text-xs text-zinc-500 underline-offset-2 hover:underline"
					>
						Voltar à conversa
					</button>
				</div>
			</header>

			<main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
				<div className="mx-auto max-w-md">
					<h1 className="text-xl font-semibold text-zinc-900">
						Já dá pra te mandar uma proposta inicial
					</h1>
					<p className="mt-1.5 text-sm text-zinc-600">
						{props.qualifiedReason
							? props.qualifiedReason
							: "Com o que conversamos, já consigo desenhar o que dá pra automatizar no seu negócio."}
					</p>

					<section className="mt-6 space-y-3" aria-labelledby="finalize-contact">
						<h2 id="finalize-contact" className="sr-only">
							Como te procuro
						</h2>
						<label className="block text-sm">
							<span className="font-medium text-zinc-900">
								Seu e-mail <span className="text-zinc-400" aria-hidden="true">*</span>
							</span>
							<input
								ref={emailInputRef}
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={submitting}
								placeholder="voce@empresa.com"
								autoComplete="email"
								aria-required="true"
								aria-describedby="contact-hint"
								className={cn(
									"mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900",
									"placeholder:text-zinc-500",
									"focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500",
									"disabled:cursor-not-allowed disabled:opacity-60",
								)}
							/>
						</label>

						<div className="flex items-center gap-2 text-xs text-zinc-400" aria-hidden="true">
							<span className="h-px flex-1 bg-zinc-200" />
							<span className="font-medium uppercase tracking-wide">ou</span>
							<span className="h-px flex-1 bg-zinc-200" />
						</div>

						<label className="block text-sm">
							<span className="font-medium text-zinc-900">
								WhatsApp <span className="text-zinc-400" aria-hidden="true">*</span>
							</span>
							<input
								type="tel"
								value={whatsapp}
								onChange={(e) => setWhatsApp(maskPhone(e.target.value))}
								disabled={submitting}
								placeholder="(11) 99999-9999"
								autoComplete="tel"
								aria-required="true"
								aria-describedby="contact-hint"
								className={cn(
									"mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900",
									"placeholder:text-zinc-500",
									"focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500",
									"disabled:cursor-not-allowed disabled:opacity-60",
								)}
							/>
						</label>
						<p id="contact-hint" className="text-xs text-zinc-500">
							Precisamos de pelo menos um contato pra mandar a proposta.
						</p>
					</section>

					{error && (
						<div
							className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
							role="alert"
							aria-atomic="true"
						>
							<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
							<div className="flex-1">
								<p>{error}</p>
								{isRetriable && (
									<button
										type="button"
										onClick={handleSubmit}
										disabled={submitting}
										className="mt-1 inline-flex text-xs font-medium text-rose-900 underline underline-offset-2 hover:text-rose-700 disabled:opacity-50"
									>
										Tentar de novo
									</button>
								)}
							</div>
						</div>
					)}

					<Button
						onClick={handleSubmit}
						disabled={submitting || !canSubmit}
						className="mt-6 h-11 w-full rounded-xl bg-violet-600 text-base font-medium hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
					>
						{submitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Enviando…
							</>
						) : (
							"Enviar e receber proposta"
						)}
					</Button>

					<p className="mt-3 text-center text-xs text-zinc-500">
						Sem cobrança agora. Nosso time entra em contato com a proposta.
					</p>

					{hasExtracted(props.extracted) && (
						<EditableSummary
							initial={props.extracted}
							disabled={submitting}
							onChange={(next) => setEditedExtracted(next)}
						/>
					)}
				</div>
			</main>
		</div>
	);
}

// EditableSummary lets the visitor adjust what the agent extracted before
// submitting. Collapsed by default so it doesn't fight the primary CTA.
// Each line toggles between a static chip-list and a comma-separated input.
function EditableSummary({
	initial,
	disabled,
	onChange,
}: {
	initial: ClaraExtracted;
	disabled: boolean;
	onChange: (next: ClaraExtracted) => void;
}) {
	const [edited, setEdited] = useState<ClaraExtracted>(initial);
	const [openField, setOpenField] = useState<keyof ClaraExtracted | null>(null);

	// Propagate to parent whenever the user finalises an edit.
	useEffect(() => {
		onChange(edited);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [edited]);

	const fields: { key: keyof ClaraExtracted; label: string; help: string }[] = [
		{ key: "segments", label: "Negócio", help: "Use vírgulas para separar" },
		{ key: "channels", label: "Canais", help: "Ex: whatsapp, instagram, site" },
		{ key: "pains", label: "Dores", help: "O que mais cansa hoje?" },
		{ key: "systems", label: "Sistemas", help: "Planilha, CRM, ERP…" },
	];

	const setListField = (key: keyof ClaraExtracted, raw: string) => {
		const items = raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		setEdited((cur) => ({ ...cur, [key]: items }));
	};

	const identityValue = joinNonEmpty([edited.contactName, edited.companyName]);

	return (
		<details className="mt-8 rounded-xl border border-zinc-200 bg-white shadow-sm">
			<summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-violet-500">
				<span className="font-medium text-zinc-900">O que entendi do seu negócio</span>
				<span className="text-xs text-zinc-500">tocar para revisar/editar</span>
			</summary>
			<dl className="space-y-3 border-t border-zinc-100 px-4 py-3">
				{identityValue && <ExtractedRow label="Quem" value={identityValue} />}

				{fields.map((f) => {
					const values = (edited[f.key] as string[] | undefined) ?? [];
					const isOpen = openField === f.key;
					return (
						<div key={f.key as string} className="flex items-baseline gap-3">
							<dt className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
								{f.label}
							</dt>
							<dd className="flex-1 text-sm text-zinc-900">
								{isOpen ? (
									<input
										autoFocus
										defaultValue={values.join(", ")}
										disabled={disabled}
										aria-label={`${f.label}. ${f.help}`}
										onBlur={(e) => {
											setListField(f.key, e.target.value);
											setOpenField(null);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												setListField(f.key, e.currentTarget.value);
												setOpenField(null);
											}
											if (e.key === "Escape") setOpenField(null);
										}}
										className="w-full rounded-md border border-violet-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
									/>
								) : (
									<button
										type="button"
										onClick={() => !disabled && setOpenField(f.key)}
										disabled={disabled}
										className="group flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed"
										aria-label={`Editar ${f.label}`}
									>
										<span className="whitespace-normal">
											{values.length > 0 ? (
												values.join(", ")
											) : (
												<span className="text-zinc-400">— toque para adicionar</span>
											)}
										</span>
										<Pencil className="h-3 w-3 shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100" />
									</button>
								)}
							</dd>
							{isOpen && (
								<button
									type="button"
									onClick={() => setOpenField(null)}
									className="rounded-md p-1 text-violet-600 hover:bg-violet-50"
									aria-label="Confirmar"
								>
									<Check className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
					);
				})}
			</dl>
		</details>
	);
}

function ExtractedRow({ label, value }: { label: string; value: string }) {
	if (!value) return null;
	return (
		<div className="flex items-baseline gap-3">
			<dt className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
				{label}
			</dt>
			<dd className="text-sm text-zinc-900">{value}</dd>
		</div>
	);
}

function hasExtracted(e: ClaraExtracted): boolean {
	return Boolean(
		e.contactName ||
			e.companyName ||
			e.segments.length ||
			e.channels.length ||
			e.pains.length ||
			e.systems.length,
	);
}

function joinNonEmpty(parts: (string | undefined)[]): string {
	return parts.filter((x): x is string => Boolean(x && x.trim())).join(" · ");
}

// ──────────────────────────────────────────────────────────────────────────────
// Tiny validators. Intentionally lax: pre-cadastro is the funnel top, not the
// place to gatekeep on typos.

function isValidEmail(s: string): boolean {
	const v = s.trim();
	if (!v) return false;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function digitsOnly(s: string): string {
	return s.replace(/\D+/g, "");
}

function isValidPhone(s: string): boolean {
	return digitsOnly(s).length >= 10;
}

// retryOn5xx executes `fn`, and if it throws a server-side error (HTTP 5xx
// or a network blip), retries with linear backoff up to `maxRetries` extra
// attempts. 4xx errors propagate immediately so the caller can surface them.
async function retryOn5xx<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			const code = errorStatusCode(err);
			if (code >= 400 && code < 500) throw err; // contract error — don't retry
			if (attempt === maxRetries) break;
			await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
		}
	}
	throw lastErr;
}

function errorStatusCode(err: unknown): number {
	if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
		return (err as { status: number }).status;
	}
	// Heuristic on plain Error message ("API error: 400 Bad Request").
	const msg = err instanceof Error ? err.message : "";
	const m = /\b([45]\d{2})\b/.exec(msg);
	return m ? Number(m[1]) : 0;
}

function isProbably5xx(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("indispon") ||
		lower.includes("rede") ||
		lower.includes("conex") ||
		lower.includes("tente novamente") ||
		lower.includes("tenta de novo")
	);
}

// humanizeSubmitError converts whatever the API client throws into something
// a non-technical visitor can read. It never echoes raw JSON or stack traces.
function humanizeSubmitError(err: unknown): string {
	const code = errorStatusCode(err);
	const raw = err instanceof Error ? err.message : "";
	const inner = parseInnerErrorMessage(raw);

	// Map known validator messages from internal/saas/api/company_intakes.go.
	if (inner) {
		const lower = inner.toLowerCase();
		if (lower.includes("nome da empresa")) return "Falta o nome da empresa.";
		if (lower.includes("respons")) return "Falta o nome do responsável.";
		if (lower.includes("whatsapp ou e-mail")) return "Precisamos do seu WhatsApp ou e-mail.";
		if (lower.includes("tipo de empresa") || lower.includes("oferta")) {
			return "Conta um pouquinho mais sobre o que sua empresa faz antes de mandar.";
		}
	}

	if (code === 401) return "Essa sessão expirou. Recarregue a página e tente de novo.";
	if (code === 404) return "Não achei essa conversa. Recarregue e comece de novo.";
	if (code === 429) return "Muitas tentativas. Espera um instante e tenta de novo.";
	if (code >= 500 && code <= 599) {
		return "Nosso serviço está indisponível agora. Tenta de novo em alguns segundos.";
	}
	if (code >= 400 && code <= 499) {
		return inner || "Não consegui validar os dados. Confere os campos e tenta de novo.";
	}
	if (!raw) return "Sem conexão. Verifica sua internet e tente de novo.";
	if (raw.length > 140) return "Algo travou aqui. Tente de novo.";
	return raw;
}

function parseInnerErrorMessage(raw: string): string {
	// "{"error":"informe o nome da empresa"}" or plain text.
	const start = raw.indexOf("{");
	if (start === -1) return raw;
	try {
		const obj = JSON.parse(raw.slice(start)) as { error?: string };
		return typeof obj.error === "string" ? obj.error : "";
	} catch {
		return raw;
	}
}

// maskPhone mirrors the legacy useIntakeCore mask (XX) XXXXX-XXXX so a draft
// hydrated from the chat flow can move into finalize without re-typing.
function maskPhone(raw: string): string {
	const d = digitsOnly(raw).slice(0, 11);
	if (d.length <= 2) return d;
	if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
