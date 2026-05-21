// ClaraChat renders the public pre-cadastro conversation using the same
// lightweight chat shape as /sofia-onboarding, while preserving the existing
// SSE state machine, qualification callback, provisioning banner and summary.

import {
	ArrowUp,
	CheckCircle2,
	ClipboardList,
	FileText,
	MessageCircle,
	Mic,
	Paperclip,
	Users,
	type LucideIcon,
} from "lucide-react";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { cn } from "@/lib/utils";

import {
	extractFromIntake,
	useClaraChat,
	type ClaraChatState,
	type ClaraExtracted,
	type ClaraMessage,
	type ClaraProvisioned,
	type ClaraProvisioningStatus,
} from "./useClaraChat";

export type ClaraChatProps = {
	intakeId: string;
	resumeToken: string;
	contactName?: string;
	companyName?: string;
	/** Whatever already sits in company_intakes.answers JSON. Hydrates the side panel. */
	answers?: Record<string, unknown>;
	/** Optional resume of prior chat_messages, in their stored order. */
	initialMessages?: ClaraMessage[];
	/** Fires when the agent's mark_qualified tool succeeds. */
	onQualified?: (reason: string, extracted: ClaraExtracted) => void;
};

const HARD_LIMIT_USER_TURNS = 56;
const SOFT_LIMIT_USER_TURNS = 50;

const QUICK_ACTIONS: { label: string; prompt: string; icon: LucideIcon }[] = [
	{
		label: "Organizar atendimento",
		prompt: "Quero organizar meu atendimento e entender por onde começar.",
		icon: MessageCircle,
	},
	{
		label: "Criar resumo inicial",
		prompt: "Quero que você monte um resumo inicial do meu negócio.",
		icon: ClipboardList,
	},
	{
		label: "Configurar equipe",
		prompt: "Quero configurar uma equipe de agentes para atendimento e vendas.",
		icon: Users,
	},
];

export function ClaraChat(props: ClaraChatProps) {
	const chat = useClaraChat({
		intakeId: props.intakeId,
		resumeToken: props.resumeToken,
		initialMessages: props.initialMessages,
	});

	const hydratedExtractedEarly = useMemo(
		() => extractFromIntake(props.answers ?? null, props.contactName ?? "", props.companyName ?? ""),
		[props.answers, props.contactName, props.companyName],
	);
	const mergedExtractedEarly = useMemo(
		() => mergeExtracted(hydratedExtractedEarly, chat.extracted),
		[hydratedExtractedEarly, chat.extracted],
	);

	const lastNotified = useRef(false);
	useEffect(() => {
		if (chat.qualified && !lastNotified.current) {
			lastNotified.current = true;
			props.onQualified?.(chat.qualifiedReason, mergedExtractedEarly);
		}
	}, [chat.qualified, chat.qualifiedReason, mergedExtractedEarly, props]);

	const seededFirstTurn = useRef(false);
	useEffect(() => {
		if (seededFirstTurn.current) return;
		if (chat.messages.length > 0) {
			seededFirstTurn.current = true;
			return;
		}
		const timer = window.setTimeout(() => {
			if (seededFirstTurn.current) return;
			seededFirstTurn.current = true;
			void chat.send("Oi! Pode começar.");
		}, 150);
		return () => window.clearTimeout(timer);
	}, [chat.messages.length, chat.send]);

	const [summaryOpen, setSummaryOpen] = useState(false);
	const mergedExtracted = mergedExtractedEarly;
	const busy = chat.status === "sending" || chat.status === "streaming";

	return (
		<div className="flex min-h-[100dvh] flex-col bg-[#f7f8fb] text-slate-950">
			<ChatTopBar
				summaryAvailable={hasAnyExtracted(mergedExtractedEarly)}
				onOpenSummary={() => setSummaryOpen(true)}
				online={chat.status !== "error"}
			/>

			<MessageList chat={chat} />

			<LimitWarning chat={chat} />

			<ProvisionBanner
				intakeId={props.intakeId}
				resumeToken={props.resumeToken}
				status={chat.provisioning}
				provisioned={chat.provisioned}
				error={chat.provisionError}
			/>

			<ErrorBanner error={chat.error} messages={chat.messages} />

			<QuickActions
				disabled={busy || chat.qualified}
				onSend={(text) => void chat.send(text)}
			/>

			<Composer
				disabled={busy}
				onSend={(text) => void chat.send(text)}
				qualified={chat.qualified}
			/>

			<SummarySheet
				open={summaryOpen}
				onClose={() => setSummaryOpen(false)}
				extracted={mergedExtracted}
			/>
		</div>
	);
}

function ChatTopBar({
	summaryAvailable,
	onOpenSummary,
	online,
}: {
	summaryAvailable: boolean;
	onOpenSummary: () => void;
	online: boolean;
}) {
	return (
		<header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
			<div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
				<div className="flex min-w-0 items-center gap-3">
					<div className="hidden sm:block">
						<SofiaOrb size="md" />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold leading-tight text-slate-950 sm:text-lg">
							Sofia
						</h1>
						<p className="hidden text-sm text-slate-500 sm:block">
							pré-cadastro guiado
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
							online ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
						)}
						role="status"
					>
						<span
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								online ? "bg-emerald-500" : "bg-rose-500",
							)}
							aria-hidden="true"
						/>
						{online ? "online" : "reconectando"}
					</span>
					<button
						type="button"
						onClick={onOpenSummary}
						disabled={!summaryAvailable}
						aria-label={
							summaryAvailable
								? "Ver o que a Sofia entendeu até agora"
								: "Disponível depois que a Sofia entender seu negócio"
						}
						className={cn(
							"inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition",
							summaryAvailable
								? "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-950"
								: "cursor-not-allowed border-transparent bg-slate-100 text-slate-400",
						)}
					>
						<FileText className="h-4 w-4" aria-hidden="true" />
						<span className="hidden sm:inline">o que anotei</span>
					</button>
				</div>
			</div>
		</header>
	);
}

function MessageList({ chat }: { chat: ClaraChatState }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			const threshold = 72;
			stickToBottom.current =
				el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	const lastAssistantLen =
		chat.messages.length > 0
			? chat.messages[chat.messages.length - 1]?.content?.length ?? 0
			: 0;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickToBottom.current) {
			el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
		}
	}, [chat.messages.length, lastAssistantLen, chat.status]);

	const visible = chat.messages.filter(
		(m, idx) => !(idx === 0 && m.role === "user" && m.content === "Oi! Pode começar."),
	);

	return (
		<main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
			<section
				className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8"
				aria-label="Chat público com Sofia"
			>
				{visible.length === 0 && <IntroState pending={chat.status === "sending"} />}
				<ol
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					aria-label="Conversa com a Sofia"
					className="mx-auto flex w-full max-w-3xl list-none flex-col gap-3"
				>
					{visible.map((m, index) => (
						<MessageItem key={m.id} message={m} index={index} />
					))}
					{chat.status === "sending" && visible.length > 0 && <TypingItem />}
				</ol>
			</section>
		</main>
	);
}

function IntroState({ pending }: { pending: boolean }) {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
			<div className="sm:hidden">
				<SofiaOrb size="lg" />
			</div>
			<div className="hidden sm:block">
				<SofiaOrb size="xl" />
			</div>
			<div>
				<h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
					Converse com a Sofia
				</h2>
				<p className="mt-2 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
					Ela faz perguntas curtas e organiza seu pré-cadastro em poucos minutos.
				</p>
			</div>
			{pending && (
				<div className="rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
					<TypingDots />
				</div>
			)}
		</div>
	);
}

function MessageItem({ message, index }: { message: ClaraMessage; index: number }) {
	if (message.role === "user") {
		if (!message.content) return null;
		return (
			<li
				className="sofia-chat-reveal flex justify-end"
				style={{ animationDelay: `${Math.min(index * 70, 280)}ms` }}
			>
				<div className="max-w-[min(84%,680px)] rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm leading-relaxed text-white shadow-sm sm:text-[15px]">
					<span className="sr-only">Você:</span>
					<p className="whitespace-pre-wrap">{message.content}</p>
				</div>
			</li>
		);
	}

	if (message.content || message.streaming || message.errorText) {
		return (
			<li
				className="sofia-chat-reveal flex justify-start gap-3"
				style={{ animationDelay: `${Math.min(index * 70, 280)}ms` }}
			>
				<div className="mt-1 shrink-0">
					<SofiaOrb size="sm" />
				</div>
				<div
					className={cn(
						"max-w-[min(84%,680px)] rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm leading-relaxed shadow-sm sm:text-[15px]",
						message.errorText
							? "border-rose-200 text-rose-900"
							: "border-slate-200/80 text-slate-900",
					)}
				>
					<span className="sr-only">Sofia:</span>
					{message.content && (
						<p className="whitespace-pre-wrap">
							{message.content}
							{message.streaming && (
								<span className="sofia-chat-cursor ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.18em] bg-slate-950 align-middle" />
							)}
						</p>
					)}
					{message.streaming && !message.content && <TypingDots />}
					{message.errorText && (
						<p role="alert" aria-atomic="true">
							{message.errorText}
						</p>
					)}
				</div>
			</li>
		);
	}

	return null;
}

function TypingItem() {
	return (
		<li className="sofia-chat-reveal flex justify-start gap-3">
			<div className="mt-1 shrink-0">
				<SofiaOrb size="sm" />
			</div>
			<div className="rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
				<span className="sr-only">Sofia está pensando</span>
				<TypingDots />
			</div>
		</li>
	);
}

function TypingDots() {
	return (
		<span className="inline-flex items-center gap-1.5" aria-label="Sofia está pensando">
			<span className="sofia-chat-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
			<span className="sofia-chat-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:140ms]" />
			<span className="sofia-chat-dot h-1.5 w-1.5 rounded-full bg-slate-400 [animation-delay:280ms]" />
		</span>
	);
}

function QuickActions({
	disabled,
	onSend,
}: {
	disabled: boolean;
	onSend: (text: string) => void;
}) {
	return (
		<div className="border-t border-slate-200/70 bg-[#f7f8fb]/95 px-4 py-3 backdrop-blur sm:px-6">
			<div className="mx-auto flex w-full max-w-3xl flex-wrap gap-2">
				{QUICK_ACTIONS.map((action) => {
					const Icon = action.icon;
					return (
						<button
							key={action.label}
							type="button"
							disabled={disabled}
							onClick={() => onSend(action.prompt)}
							className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
						>
							<Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
							{action.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

function Composer({
	disabled,
	onSend,
	qualified,
}: {
	disabled: boolean;
	onSend: (text: string) => void;
	qualified: boolean;
}) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSend = () => {
		const text = value.trim();
		if (!text || disabled || qualified) return;
		onSend(text);
		setValue("");
		if (textareaRef.current) textareaRef.current.style.height = "auto";
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		setValue(event.target.value);
		const textarea = event.target;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
	};

	useEffect(() => {
		if (!disabled && !qualified) textareaRef.current?.focus();
	}, [disabled, qualified]);

	const canSend = !disabled && !qualified && value.trim().length > 0;

	return (
		<div
			className="sticky bottom-0 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4"
			style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
		>
			<div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_60px_-35px_rgba(15,23,42,0.45)]">
				<button
					type="button"
					disabled
					aria-label="Anexar documento"
					title="Anexos ficam disponíveis no painel"
					className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 disabled:opacity-45"
				>
					<Paperclip className="h-4 w-4" aria-hidden="true" />
				</button>
				<div className="min-w-0 flex-1">
					<label htmlFor="sofia-message-input" className="sr-only">
						Sua resposta para a Sofia
					</label>
					<textarea
						id="sofia-message-input"
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						placeholder={
							qualified ? "Resumo pronto. Confirme o contato acima." : "Escreva para a Sofia..."
						}
						rows={1}
						disabled={disabled || qualified}
						aria-multiline="true"
						className="max-h-40 w-full resize-none bg-transparent px-1 py-2.5 text-[16px] leading-relaxed text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
					/>
				</div>
				<button
					type="button"
					disabled
					aria-label="Enviar áudio"
					title="Áudio fica disponível no painel"
					className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 disabled:opacity-45"
				>
					<Mic className="h-4 w-4" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label="Enviar mensagem"
					className={cn(
						"grid h-10 w-10 shrink-0 place-items-center rounded-xl transition",
						canSend
							? "bg-slate-950 text-white hover:bg-slate-800"
							: "bg-slate-100 text-slate-400",
					)}
				>
					<ArrowUp className="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}

function LimitWarning({ chat }: { chat: ClaraChatState }) {
	const userTurns = chat.messages.filter((m) => m.role === "user" && m.content).length;
	if (chat.qualified) return null;
	if (userTurns < SOFT_LIMIT_USER_TURNS) return null;

	const reached = userTurns >= HARD_LIMIT_USER_TURNS;
	const remaining = Math.max(0, HARD_LIMIT_USER_TURNS - userTurns);

	return (
		<aside
			className="border-t border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6"
			role="status"
			aria-live="polite"
		>
			<div className="mx-auto max-w-3xl">
				{reached
					? "Conversamos bastante. Vou montar o resumo e abrir o painel."
					: `Faltam ${remaining} ${remaining === 1 ? "mensagem" : "mensagens"} para eu fechar o pré-cadastro.`}
			</div>
		</aside>
	);
}

function ProvisionBanner({
	intakeId,
	resumeToken,
	status,
	provisioned,
	error,
}: {
	intakeId: string;
	resumeToken: string;
	status: ClaraProvisioningStatus;
	provisioned: ClaraProvisioned | null;
	error: string;
}) {
	if (status === "idle") return null;

	if (status === "provisioning") {
		return (
			<aside className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6" role="status">
				<div className="mx-auto flex max-w-3xl items-center gap-3 text-sm text-slate-700">
					<TypingDots />
					Preparando seu painel agora.
				</div>
			</aside>
		);
	}

	if (status === "error") {
		return (
			<aside className="border-t border-rose-200 bg-rose-50 px-4 py-4 sm:px-6" role="status">
				<div className="mx-auto max-w-3xl">
					<p className="text-sm font-medium text-rose-900">
						Não consegui preparar o painel agora.
					</p>
					<p className="mt-1 text-sm text-rose-700">
						{error || "A equipe já recebeu o aviso e vai te chamar."}
					</p>
				</div>
			</aside>
		);
	}

	if (!provisioned) return null;

	if (provisioned.alreadyExists) {
		return (
			<ProvisionSuccessCard
				title="Você já tem painel ativo"
				subtitle={`Está em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine="Use o link que você já recebeu no email para entrar."
			/>
		);
	}

	if (provisioned.loginMode === "magic_link") {
		return (
			<ProvisionSuccessCard
				title="Seu painel está pronto"
				subtitle={`Está em ${friendlyURL(provisioned.url)}`}
				url={provisioned.url}
				email={provisioned.email}
				secondaryLine={
					provisioned.checkEmail
						? "Acabei de mandar um link de acesso no seu email."
						: undefined
				}
				resend={
					provisioned.checkEmail
						? { intakeId, resumeToken, email: provisioned.email }
						: undefined
				}
			/>
		);
	}

	return (
		<ProvisionSuccessCard
			title="Seu painel está pronto"
			subtitle={`Está em ${friendlyURL(provisioned.url)}`}
			url={provisioned.url}
			email={provisioned.email}
			password={provisioned.initialPassword}
		/>
	);
}

function ProvisionSuccessCard({
	title,
	subtitle,
	url,
	email,
	password,
	secondaryLine,
	resend,
}: {
	title: string;
	subtitle: string;
	url: string;
	email: string;
	password?: string;
	secondaryLine?: string;
	resend?: { intakeId: string; resumeToken: string; email: string };
}) {
	const [copied, setCopied] = useState<"" | "email" | "password" | "all">("");
	const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">(
		"idle",
	);

	const copy = (text: string, kind: "email" | "password" | "all") => {
		if (!navigator.clipboard) return;
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(kind);
			window.setTimeout(() => setCopied(""), 1800);
		});
	};

	const doResend = async () => {
		if (!resend) return;
		setResendState("sending");
		try {
			const res = await fetch(
				`/api/v1/public/company-intakes/${encodeURIComponent(resend.intakeId)}/resend-link`,
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ resume_token: resend.resumeToken }),
				},
			);
			setResendState(res.ok ? "sent" : "error");
		} catch {
			setResendState("error");
		}
	};

	return (
		<aside className="border-t border-emerald-200 bg-emerald-50 px-4 py-5 sm:px-6">
			<div className="mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
				<div className="flex items-start gap-3">
					<div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
						<CheckCircle2 className="h-5 w-5" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-base font-semibold text-slate-950">{title}</p>
						<p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
						{secondaryLine && <p className="mt-2 text-sm text-slate-600">{secondaryLine}</p>}

						{password && (
							<dl className="mt-4 space-y-2 text-sm">
								<CredentialRow
									label="Email"
									value={email}
									copied={copied === "email"}
									onCopy={() => copy(email, "email")}
								/>
								<CredentialRow
									label="Senha"
									value={password}
									copied={copied === "password"}
									onCopy={() => copy(password, "password")}
								/>
								<button
									type="button"
									onClick={() => copy(`${email}\n${password}`, "all")}
									className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
								>
									{copied === "all" ? "copiado" : "copiar email + senha"}
								</button>
							</dl>
						)}

						<div className="mt-4 flex flex-wrap items-center gap-3">
							<a
								href={url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex h-10 items-center rounded-full bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
							>
								Entrar no meu painel
							</a>
							{resend && (
								<button
									type="button"
									onClick={() => void doResend()}
									disabled={resendState === "sending" || resendState === "sent"}
									className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline disabled:opacity-50"
								>
									{resendState === "sent"
										? "link reenviado"
										: resendState === "sending"
											? "enviando..."
											: resendState === "error"
												? "tentar de novo"
												: "reenviar link"}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
}

function CredentialRow({
	label,
	value,
	copied,
	onCopy,
}: {
	label: string;
	value: string;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<dt className="w-14 shrink-0 text-slate-500">{label}</dt>
			<dd className="flex min-w-0 flex-1 items-center gap-2">
				<code className="truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900">
					{value}
				</code>
				<button
					type="button"
					onClick={onCopy}
					className="text-xs font-medium text-slate-600 hover:text-slate-950"
				>
					{copied ? "copiado" : "copiar"}
				</button>
			</dd>
		</div>
	);
}

function ErrorBanner({ error, messages }: { error: string; messages: ClaraMessage[] }) {
	if (!error) return null;
	const hasInlineError = messages.some((message) => message.role === "assistant" && Boolean(message.errorText));
	if (hasInlineError) return null;
	return (
		<aside
			className="border-t border-rose-200 bg-rose-50 px-4 py-3 sm:px-6"
			role="alert"
			aria-atomic="true"
		>
			<div className="mx-auto max-w-3xl text-sm text-rose-900">{error}</div>
		</aside>
	);
}

function SummarySheet({
	open,
	onClose,
	extracted,
}: {
	open: boolean;
	onClose: () => void;
	extracted: ClaraExtracted;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const empty =
		!extracted.companyName &&
		!extracted.contactName &&
		extracted.segments.length === 0 &&
		extracted.channels.length === 0 &&
		extracted.pains.length === 0 &&
		extracted.systems.length === 0 &&
		!extracted.problemArea &&
		typeof extracted.salesOnline !== "boolean" &&
		!extracted.productType;

	const salesChips: string[] = [];
	if (typeof extracted.salesOnline === "boolean") {
		salesChips.push(extracted.salesOnline ? "vende online" : "só presencial");
	}
	if (extracted.productType) salesChips.push(extracted.productType);

	return (
		<div className="fixed inset-0 z-50 flex">
			<button
				type="button"
				className="flex-1 bg-slate-950/25 backdrop-blur-[2px]"
				aria-label="Fechar painel"
				onClick={onClose}
			/>
			<aside className="flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl sm:max-w-md">
				<div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
					<div>
						<p className="text-base font-semibold text-slate-950">O que anotei</p>
						<p className="text-sm text-slate-500">preenchido durante a conversa</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-950"
						aria-label="Fechar"
					>
						fechar
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-5">
					{empty ? (
						<p className="text-sm leading-6 text-slate-500">
							Ainda não anotei nada concreto. Converse mais um pouco que eu organizo aqui.
						</p>
					) : (
						<dl className="space-y-5">
							<SummarySection
								label="quem"
								items={[extracted.contactName, extracted.companyName].filter(Boolean) as string[]}
							/>
							<SummarySection label="negócio" items={extracted.segments} />
							<SummarySection label="como vende" items={salesChips} />
							<SummarySection label="canais" items={extracted.channels} />
							<SummarySection
								label="foco"
								items={extracted.problemArea ? [PROBLEM_AREA_LABELS[extracted.problemArea]] : []}
							/>
							<SummarySection label="dores" items={extracted.pains} />
							<SummarySection label="sistemas" items={extracted.systems} />
						</dl>
					)}
				</div>
			</aside>
		</div>
	);
}

function SummarySection({ label, items }: { label: string; items: string[] }) {
	if (items.length === 0) return null;
	return (
		<div>
			<dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				{label}
			</dt>
			<dd className="flex flex-wrap gap-1.5">
				{items.map((item) => (
					<span
						key={item}
						className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
					>
						{item}
					</span>
				))}
			</dd>
		</div>
	);
}

function SofiaOrb({ size }: { size: "sm" | "md" | "lg" | "xl" }) {
	const sizeClass = {
		sm: "h-8 w-8",
		md: "h-11 w-11",
		lg: "h-14 w-14",
		xl: "h-20 w-20",
	}[size];

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-full border border-white/80 bg-slate-200 shadow-sm",
				sizeClass,
			)}
			aria-hidden="true"
		>
			<div className="absolute inset-0 bg-[conic-gradient(from_170deg_at_50%_50%,#38bdf8,#6366f1,#a855f7,#f59e0b,#22d3ee,#38bdf8)]" />
			<div className="absolute inset-1 rounded-full bg-[radial-gradient(circle_at_38%_35%,rgba(255,255,255,0.82),transparent_26%),radial-gradient(circle_at_70%_68%,rgba(15,23,42,0.42),transparent_45%)] mix-blend-screen" />
			<div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/60" />
		</div>
	);
}

function friendlyURL(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

function hasAnyExtracted(e: ClaraExtracted): boolean {
	return Boolean(
		e.companyName ||
			e.contactName ||
			e.segments.length ||
			e.channels.length ||
			e.pains.length ||
			e.systems.length ||
			e.problemArea ||
			typeof e.salesOnline === "boolean" ||
			e.productType,
	);
}

const PROBLEM_AREA_LABELS: Record<NonNullable<ClaraExtracted["problemArea"]>, string> = {
	vendas: "Vendas",
	atendimento: "Atendimento",
	suporte: "Suporte pós-venda",
	agendamento: "Agendamento",
	marketing: "Marketing / presença",
	gestao: "Organização interna",
};

function mergeExtracted(server: ClaraExtracted, live: ClaraExtracted): ClaraExtracted {
	const pick = (serverValue: string[], liveValue: string[]) =>
		serverValue.length > 0 ? serverValue : liveValue;
	const pickStr = (serverValue: string | undefined, liveValue: string | undefined) =>
		serverValue || liveValue;

	return {
		companyName: server.companyName || live.companyName,
		contactName: server.contactName || live.contactName,
		segments: pick(server.segments, live.segments),
		channels: pick(server.channels, live.channels),
		pains: pick(server.pains, live.pains),
		systems: pick(server.systems, live.systems),
		offer: pickStr(server.offer, live.offer),
		website: pickStr(server.website, live.website),
		instagram: pickStr(server.instagram, live.instagram),
		crmName: pickStr(server.crmName, live.crmName),
		crmNotes: pickStr(server.crmNotes, live.crmNotes),
		quotingPersonalized:
			typeof server.quotingPersonalized === "boolean"
				? server.quotingPersonalized
				: live.quotingPersonalized,
		quotingNotes: pickStr(server.quotingNotes, live.quotingNotes),
		priorityAgent: server.priorityAgent || live.priorityAgent,
		priorityReason: pickStr(server.priorityReason, live.priorityReason),
		problemArea: server.problemArea || live.problemArea,
		problemAreaNote: pickStr(server.problemAreaNote, live.problemAreaNote),
		salesOnline:
			typeof server.salesOnline === "boolean" ? server.salesOnline : live.salesOnline,
		productType: pickStr(server.productType, live.productType),
		salesNote: pickStr(server.salesNote, live.salesNote),
	};
}
