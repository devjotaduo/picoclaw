// ClaraFinalize is the single-step conversion screen shown after the Clara
// agent fires the `mark_qualified` tool. We deliberately keep it minimal:
// one card with what was extracted, one form with two fields, one CTA.
//
// The agent has already populated company_name / contact_name / answers via
// tool calls during the conversation, so the only missing pieces are usually
// contact_email and contact_whatsapp. We pre-fill them when the agent caught
// them in passing and skip the visit to the legacy 22-step wizard entirely.

import { useMemo, useState } from "react";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";

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
		try {
			// Persist final contact details before flipping the status to submitted.
			await savePublicIntake({
				id: props.intake.id,
				resume_token: props.resumeToken,
				company_name: props.intake.company_name,
				contact_name: props.intake.contact_name,
				contact_email: emailValid ? email.trim() : props.intake.contact_email ?? "",
				contact_whatsapp: whatsappValid ? digitsOnly(whatsapp) : props.intake.contact_whatsapp ?? "",
				answers: (props.intake.answers as Record<string, unknown>) ?? {},
				audio_transcript: props.intake.audio_transcript ?? "",
			});
			await submitPublicIntake(props.intake.id, props.resumeToken);
			props.onSubmitted();
		} catch (err) {
			setError(err instanceof Error ? err.message : "falha ao enviar; tenta de novo");
			setSubmitting(false);
		}
	};

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

					{hasExtracted(props.extracted) && (
						<section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
							<p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
								O que entendi
							</p>
							<div className="mt-3 space-y-2.5">
								<ExtractedRow label="Quem" value={joinNonEmpty([props.extracted.contactName, props.extracted.companyName])} />
								<ExtractedRow label="Negócio" value={props.extracted.segments.join(", ")} />
								<ExtractedRow label="Canais" value={props.extracted.channels.join(", ")} />
								<ExtractedRow label="Dores" value={props.extracted.pains.join(", ")} />
							</div>
						</section>
					)}

					<section className="mt-6 space-y-3">
						<label className="block text-sm">
							<span className="font-medium text-zinc-900">Seu e-mail</span>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={submitting}
								placeholder="voce@empresa.com"
								className={cn(
									"mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm",
									"placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100",
									"disabled:cursor-not-allowed disabled:opacity-60",
								)}
							/>
						</label>
						<label className="block text-sm">
							<span className="font-medium text-zinc-900">WhatsApp</span>
							<input
								type="tel"
								value={whatsapp}
								onChange={(e) => setWhatsApp(maskPhone(e.target.value))}
								disabled={submitting}
								placeholder="(11) 99999-9999"
								className={cn(
									"mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm",
									"placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100",
									"disabled:cursor-not-allowed disabled:opacity-60",
								)}
							/>
						</label>
						<p className="text-xs text-zinc-500">
							Precisamos de pelo menos um contato pra mandar a proposta.
						</p>
					</section>

					{error && (
						<div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
							<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
							<span>{error}</span>
						</div>
					)}

					<Button
						onClick={handleSubmit}
						disabled={submitting || !canSubmit}
						className="mt-6 h-11 w-full rounded-xl bg-violet-600 text-base font-medium hover:bg-violet-700"
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
				</div>
			</main>
		</div>
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

// maskPhone mirrors the legacy useIntakeCore mask (XX) XXXXX-XXXX so a draft
// hydrated from the chat flow can move into finalize without re-typing.
function maskPhone(raw: string): string {
	const d = digitsOnly(raw).slice(0, 11);
	if (d.length <= 2) return d;
	if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
