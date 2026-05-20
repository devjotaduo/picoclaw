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
					<h1 className="text-xl font-semibold text-zinc-900">Confere o que entendi</h1>
					<p className="mt-1.5 text-sm text-zinc-600">
						{props.qualifiedReason ||
							"Esse é o resuminho do nosso papo. Se estiver tudo certo, confirma seu contato pra gente te mandar o acesso do painel — a Sofia já te recebe lá pra fechar os detalhes (horário, regra de preço, FAQs) em uns 5 minutos."}
					</p>

					<MiniReport extracted={props.extracted} />

					<AgentRecommendations extracted={props.extracted} />

					<p className="mt-7 text-sm font-medium text-zinc-900">
						Pra onde te mandamos o acesso:
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
							"Confirmar — me mande o acesso do painel"
						)}
					</Button>

					<p className="mt-3 text-center text-xs text-zinc-500">
						Sem compromisso agora. A Sofia te recebe no painel pra fechar os
						detalhes (horário, regra de preço, FAQs) em uns 5 minutos.
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

// MiniReport renders the conversational summary Clara assembles after the
// chat — narrative, scannable, not a form. Each block is omitted when Clara
// didn't capture it (no "—" placeholders). Sofia uses this to start the
// WhatsApp follow-up already aware of the context.
const AGENT_LABELS: Record<NonNullable<ClaraExtracted["priorityAgent"]>, string> = {
	clara: "Clara (atendimento e triagem)",
	marcos: "Marcos (vendas e orçamentos)",
	camila: "Camila (suporte e pós-venda)",
	lia: "Lia (marketing e Instagram)",
	rafael: "Rafael (assistente interno do dono)",
};

const PROBLEM_AREA_LABELS: Record<NonNullable<ClaraExtracted["problemArea"]>, string> = {
	vendas: "Vendas",
	atendimento: "Atendimento ao cliente",
	suporte: "Suporte pós-venda",
	agendamento: "Agendamento",
	marketing: "Marketing / presença",
	gestao: "Organização interna",
};

function MiniReport({ extracted: e }: { extracted: ClaraExtracted }) {
	const blocks: { label: string; value: React.ReactNode }[] = [];

	if (e.contactName || e.companyName) {
		blocks.push({
			label: "Quem",
			value: joinNonEmpty([e.contactName, e.companyName]),
		});
	}
	if (e.offer) {
		blocks.push({ label: "Negócio", value: e.offer });
	}
	if (e.segments.length > 0) {
		blocks.push({ label: "Segmento", value: e.segments.join(", ") });
	}
	if (e.website || e.instagram) {
		blocks.push({
			label: "Onde está",
			value: joinNonEmpty([e.website, e.instagram]),
		});
	}
	if (e.channels.length > 0) {
		blocks.push({
			label: "Fala com cliente por",
			value: e.channels.join(", "),
		});
	}
	if (e.crmName) {
		blocks.push({
			label: "Gerencia clientes com",
			value: e.crmNotes ? `${e.crmName} — ${e.crmNotes}` : e.crmName,
		});
	}
	if (typeof e.quotingPersonalized === "boolean") {
		const v = e.quotingPersonalized
			? "Sim, cada cliente tem orçamento próprio"
			: "Não, usa tabela fixa";
		blocks.push({
			label: "Orçamento personalizado",
			value: e.quotingNotes ? `${v} (${e.quotingNotes})` : v,
		});
	}
	if (typeof e.salesOnline === "boolean" || e.productType) {
		const parts: string[] = [];
		if (typeof e.salesOnline === "boolean") {
			parts.push(e.salesOnline ? "Vende online" : "Só presencial");
		}
		if (e.productType) parts.push(`produto ${e.productType}`);
		blocks.push({
			label: "Como vende",
			value: e.salesNote ? `${parts.join(" · ")} — ${e.salesNote}` : parts.join(" · "),
		});
	}
	if (e.problemArea) {
		const label = PROBLEM_AREA_LABELS[e.problemArea];
		blocks.push({
			label: "Foco do problema",
			value: e.problemAreaNote ? `${label} — ${e.problemAreaNote}` : label,
		});
	}
	if (e.pains.length > 0) {
		blocks.push({
			label: "O que mais cansa hoje",
			value: e.pains.join("; "),
		});
	}
	if (e.priorityAgent) {
		blocks.push({
			label: "Prioridade",
			value: e.priorityReason
				? `${AGENT_LABELS[e.priorityAgent]} — ${e.priorityReason}`
				: AGENT_LABELS[e.priorityAgent],
		});
	}

	if (blocks.length === 0) {
		return (
			<section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				A Clara não conseguiu extrair nada concreto desta vez. Você pode voltar e contar
				um pouco mais, ou confirmar mesmo assim que a Sofia te recebe no painel pra
				entender melhor.
			</section>
		);
	}

	return (
		<section
			className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
			aria-labelledby="mini-report"
		>
			<h2 id="mini-report" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
				Mini-relatório
			</h2>
			<dl className="mt-3 space-y-2.5">
				{blocks.map((b) => (
					<div key={b.label} className="flex items-baseline gap-3">
						<dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
							{b.label}
						</dt>
						<dd className="text-sm text-zinc-900">{b.value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

// AgentRecommendations renders 1-2 cards explaining, in the visitor's own
// language, how each Jotaduo agent would help this specific business. The
// bullets are picked from a small static table indexed by problem area,
// product type, and primary channel — no LLM call, no technical jargon.
type AgentKey = NonNullable<ClaraExtracted["priorityAgent"]>;
type AgentRecommendation = { agentKey: AgentKey; label: string; bullets: string[] };

function AgentRecommendations({ extracted: e }: { extracted: ClaraExtracted }) {
	const recs = buildAgentRecommendations(e);
	if (recs.length === 0) return null;
	return (
		<section
			className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4"
			aria-labelledby="agent-recos"
		>
			<h2
				id="agent-recos"
				className="text-xs font-medium uppercase tracking-wide text-violet-700"
			>
				Como os agentes vão te ajudar
			</h2>
			<div className="mt-3 space-y-4">
				{recs.map((r) => (
					<div key={r.agentKey}>
						<p className="text-sm font-medium text-zinc-900">{r.label}</p>
						<ul className="mt-1.5 space-y-1">
							{r.bullets.map((b, i) => (
								<li
									key={`${r.agentKey}-${i}`}
									className="flex gap-2 text-sm text-zinc-800"
								>
									<span aria-hidden="true" className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-violet-500" />
									<span>{b}</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
			<p className="mt-3 text-xs text-zinc-600">
				A Sofia confirma esses pontos contigo no painel (mandamos o link no seu
				email/WhatsApp).
			</p>
		</section>
	);
}

function buildAgentRecommendations(e: ClaraExtracted): AgentRecommendation[] {
	const pains = e.pains.map((p) => p.toLowerCase());
	const channels = e.channels.map((c) => c.toLowerCase());
	const onInsta = channels.includes("instagram");
	const onZap = channels.includes("whatsapp");
	const segments = e.segments.map((s) => s.toLowerCase());
	const isClinica = segments.some((s) => s.includes("clín") || s.includes("estét") || s.includes("saúde"));
	const isLoja = segments.some((s) => s.includes("loja") || s.includes("produto") || s.includes("e-commerce"));
	const isServico = segments.some((s) => s.includes("serv") || s.includes("consultoria") || s.includes("sob medida"));
	const isRestaurante = segments.some((s) => s.includes("restaurante") || s.includes("cardápio") || s.includes("delivery"));
	const painText = pains.join(" ");
	const wantsClara =
		e.problemArea === "atendimento" ||
		e.problemArea === "agendamento" ||
		e.priorityAgent === "clara" ||
		isClinica ||
		painText.includes("demora") ||
		painText.includes("dúvida") ||
		painText.includes("responder") ||
		painText.includes("agendamento");
	const wantsMarcos =
		e.problemArea === "vendas" ||
		e.quotingPersonalized === true ||
		e.priorityAgent === "marcos" ||
		painText.includes("orçamento") ||
		painText.includes("lead");
	const wantsCamila =
		e.problemArea === "suporte" ||
		e.priorityAgent === "camila" ||
		painText.includes("reclamação") ||
		painText.includes("problema") ||
		painText.includes("pós-venda");
	const wantsLia =
		e.problemArea === "marketing" ||
		e.priorityAgent === "lia" ||
		(!!e.instagram && painText.includes("marketing"));
	const wantsRafael =
		e.problemArea === "gestao" ||
		e.priorityAgent === "rafael" ||
		painText.includes("sobrecarregado") ||
		painText.includes("esquecimento") ||
		painText.includes("follow-up");

	const recs: AgentRecommendation[] = [];
	const seen = new Set<AgentKey>();
	const add = (key: AgentKey, bullets: string[]) => {
		if (seen.has(key) || bullets.length === 0) return;
		seen.add(key);
		recs.push({ agentKey: key, label: AGENT_LABELS[key], bullets: bullets.slice(0, 3) });
	};

	// Prioritize the agent the visitor explicitly chose, then derive a
	// natural ordering from the problem area, then fall back to a stable
	// default so we always pick *some* agent when signals are sparse.
	// Sofia (onboarding) is NOT an option here — she runs once during setup,
	// the recommendations are about the ongoing-operation team.
	const areaToAgent: Record<NonNullable<ClaraExtracted["problemArea"]>, AgentKey> = {
		vendas: "marcos",
		atendimento: "clara",
		suporte: "camila",
		agendamento: "clara",
		marketing: "lia",
		gestao: "rafael",
	};
	const ordered: AgentKey[] = [];
	if (e.priorityAgent) ordered.push(e.priorityAgent);
	if (e.problemArea && !ordered.includes(areaToAgent[e.problemArea])) {
		ordered.push(areaToAgent[e.problemArea]);
	}
	for (const k of ["rafael", "clara", "marcos", "camila", "lia"] as AgentKey[]) {
		if (!ordered.includes(k)) ordered.push(k);
	}

	for (const key of ordered) {
		if (recs.length >= 2) break;
		switch (key) {
			case "clara": {
				if (!wantsClara) break;
				const bullets: string[] = [];
				if (onInsta) bullets.push("Responde DM do Instagram no mesmo minuto, dia e noite.");
				if (onZap) bullets.push("Atende o WhatsApp sem fila — separa quem quer comprar de quem só pergunta.");
				bullets.push("Repete a resposta certa pras dúvidas que aparecem todo dia.");
				if (isClinica || e.problemArea === "agendamento") {
					bullets.push("Marca, confirma e remarca consulta sem você precisar lembrar.");
				}
				add("clara", bullets);
				break;
			}
			case "marcos": {
				if (!wantsMarcos) break;
				const bullets: string[] = [];
				if (e.quotingPersonalized === true) {
					bullets.push("Monta orçamento sob medida em 5 min, com as regras que você usa.");
				} else if (isLoja || e.salesOnline === true) {
					bullets.push("Acompanha quem viu o produto e não comprou pra puxar de volta.");
				} else {
					bullets.push("Manda orçamento pronto pra você só conferir e enviar.");
				}
				bullets.push("Lembra o cliente da próxima etapa pra venda não esfriar.");
				if (e.productType === "serviço" || isServico) {
					bullets.push("Pergunta o que precisa pra fechar antes de você entrar na conversa.");
				}
				add("marcos", bullets);
				break;
			}
			case "camila": {
				if (!wantsCamila) break;
				const bullets: string[] = [];
				bullets.push("Recebe quem teve problema, coleta os dados e consulta o histórico antes de você entrar.");
				bullets.push("Acompanha pós-venda e avisa quando algo precisa de uma resposta sua.");
				if (isLoja || isRestaurante) bullets.push("Trata reclamação de pedido com tom calmo e sempre devolve com próximo passo.");
				add("camila", bullets);
				break;
			}
			case "lia": {
				if (!wantsLia) break;
				const bullets: string[] = [];
				if (e.instagram) {
					bullets.push("Posta no Instagram sem você precisar pensar no que escrever.");
					bullets.push("Sugere conteúdo das datas sazonais com o cara da marca.");
				} else {
					bullets.push("Cria post e legenda do que faz sentido pro seu público.");
				}
				if (e.website) bullets.push("Monta página simples pra cliente novo achar você.");
				add("lia", bullets);
				break;
			}
			case "rafael": {
				if (!wantsRafael) break;
				const bullets: string[] = [];
				if (isLoja || isRestaurante) {
					bullets.push("Te manda no fim do dia um resumo do que rolou e do que ficou em aberto.");
				} else {
					bullets.push("Lembra dos follow-ups que sempre escapam.");
				}
				bullets.push("Avisa no seu WhatsApp quando aparece lead quente, cliente irritado ou atendimento parado.");
				bullets.push("Sugere melhoria quando vê uma pergunta repetir várias vezes.");
				add("rafael", bullets);
				break;
			}
		}
	}

	// Drop the secondary agent when it's identical to the primary or when we
	// couldn't generate any bullet for it.
	return recs;
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
