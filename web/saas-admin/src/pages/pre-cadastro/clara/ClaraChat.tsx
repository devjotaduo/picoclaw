// ClaraChat is the chat-first conversational pre-cadastro screen. It replaces
// the legacy script-driven wizard with a single shared input box and bubbles
// for the agent's streaming responses. UX goals:
//   * one centered column on desktop, full-height on mobile
//   * Enter sends, Shift+Enter inserts newline
//   * focus returns to the composer after every assistant turn
//   * aria-live="polite" so screen readers narrate streamed deltas
//   * transparency Sheet shows what the agent extracted so far

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, CheckCircle2, AlertCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// saas-admin's badge/skeleton barrels export domain-specific variants only
// (StatusBadge, SkeletonRow…). For the chat surface we want neutral, generic
// chips and a placeholder block, so we inline-style them here rather than
// extend the shared UI module.
function Chip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-normal text-zinc-700">
			{children}
		</span>
	);
}

function EmptyPanel() {
	return (
		<div className="space-y-2 opacity-60">
			<div className="h-3 w-32 animate-pulse rounded bg-zinc-200" />
			<div className="h-3 w-48 animate-pulse rounded bg-zinc-200" />
			<div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
		</div>
	);
}

import {
	useClaraChat,
	extractFromIntake,
	type ClaraChatState,
	type ClaraExtracted,
	type ClaraMessage,
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
	/** Fires when the agent's mark_qualified tool succeeds. The parent then
	 * shows the finalize step (contact email/whatsapp confirmation). The
	 * extracted snapshot is included so the parent can render the summary
	 * card without re-deriving it from useClaraChat. */
	onQualified?: (reason: string, extracted: ClaraExtracted) => void;
};

export function ClaraChat(props: ClaraChatProps) {
	const chat = useClaraChat({
		intakeId: props.intakeId,
		resumeToken: props.resumeToken,
		initialMessages: props.initialMessages,
	});

	// Hydrate extracted side panel from persisted answers when the component
	// mounts and whenever the parent passes a fresh snapshot in. Declared
	// above the qualification effect so we can hand the merged snapshot to
	// the parent without re-deriving it inside the callback.
	const hydratedExtractedEarly = useMemo(
		() => extractFromIntake(props.answers ?? null, props.contactName ?? "", props.companyName ?? ""),
		[props.answers, props.contactName, props.companyName],
	);
	const mergedExtractedEarly = useMemo(
		() => mergeExtracted(hydratedExtractedEarly, chat.extracted),
		[hydratedExtractedEarly, chat.extracted],
	);

	// Surface qualification upward exactly once per session.
	const lastNotified = useRef(false);
	useEffect(() => {
		if (chat.qualified && !lastNotified.current) {
			lastNotified.current = true;
			props.onQualified?.(chat.qualifiedReason, mergedExtractedEarly);
		}
	}, [chat.qualified, chat.qualifiedReason, mergedExtractedEarly, props]);

	// Greet on first paint when the transcript is empty so the agent isn't
	// silent waiting for the user to type first.
	const seededFirstTurn = useRef(false);
	useEffect(() => {
		if (seededFirstTurn.current) return;
		if (chat.messages.length > 0) {
			seededFirstTurn.current = true;
			return;
		}
		seededFirstTurn.current = true;
		void chat.send("Oi! Pode começar.");
	}, [chat]);

	// Reuse the already-computed merged snapshot from the qualification effect
	// above. The Sheet renders the same data, so a second memo would only
	// double the work without changing behaviour.
	const mergedExtracted = mergedExtractedEarly;

	const [summaryOpen, setSummaryOpen] = useState(false);

	return (
		<div className="flex h-[100dvh] flex-col bg-zinc-50">
			<ChatHeader
				online={chat.status !== "error"}
				onOpenSummary={() => setSummaryOpen(true)}
			/>

			<MessageList chat={chat} />

			<ErrorBanner error={chat.error} />

			<Composer
				disabled={chat.status === "sending" || chat.status === "streaming"}
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

// ──────────────────────────────────────────────────────────────────────────────
// Header

function ChatHeader({ online, onOpenSummary }: { online: boolean; onOpenSummary: () => void }) {
	return (
		<header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
			<div className="mx-auto flex max-w-2xl items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="relative">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-semibold text-white">
							CL
						</div>
						{online && (
							<span
								className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
								aria-hidden="true"
							/>
						)}
					</div>
					<div>
						<p className="text-sm font-medium text-zinc-900">Clara</p>
						<p className="text-xs text-zinc-500">Especialista em IA & automação</p>
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={onOpenSummary}
					aria-label="Ver o que a Clara entendeu"
				>
					<Sparkles className="h-3.5 w-3.5" />
					O que entendi
				</Button>
			</div>
		</header>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages

function MessageList({ chat }: { chat: ClaraChatState }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	// Track whether the user is at the bottom so we only autoscroll when they
	// haven't manually scrolled up to read older messages.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			const threshold = 64;
			stickToBottom.current =
				el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickToBottom.current) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
	}, [chat.messages, chat.status]);

	const visible = chat.messages.filter(
		(m, idx) => !(idx === 0 && m.role === "user" && m.content === "Oi! Pode começar."),
	);

	return (
		<div
			ref={scrollRef}
			className="min-h-0 flex-1 overflow-y-auto"
			aria-live="polite"
			aria-relevant="additions"
		>
			<div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 sm:px-6">
				{visible.map((m) => (
					<MessageBubble key={m.id} message={m} />
				))}
				{chat.status === "sending" && <TypingIndicator />}
			</div>
		</div>
	);
}

function MessageBubble({ message }: { message: ClaraMessage }) {
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-2 text-sm text-white shadow-sm">
					{message.content}
				</div>
			</div>
		);
	}
	const isEmpty = !message.content && message.streaming;
	return (
		<div className="flex justify-start">
			<div
				className={cn(
					"max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-200",
					isEmpty && "opacity-60",
				)}
			>
				{isEmpty ? <TypingDots /> : <span className="whitespace-pre-wrap">{message.content}</span>}
			</div>
		</div>
	);
}

function TypingIndicator() {
	return (
		<div className="flex justify-start">
			<div className="rounded-2xl rounded-bl-md bg-white px-4 py-2 shadow-sm ring-1 ring-zinc-200">
				<TypingDots />
			</div>
		</div>
	);
}

function TypingDots() {
	return (
		<span className="inline-flex items-center gap-1" aria-label="Clara está digitando">
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
			<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
		</span>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Composer

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
		if (!text || disabled) return;
		onSend(text);
		setValue("");
		// Reset textarea height after submit.
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	};

	const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// Auto-resize textarea up to 6 lines.
	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setValue(e.target.value);
		const t = e.target;
		t.style.height = "auto";
		t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
	};

	// Refocus the input after the agent finishes its turn.
	useEffect(() => {
		if (!disabled) textareaRef.current?.focus();
	}, [disabled]);

	const placeholder = qualified
		? "Quer continuar? É só seguir 👇"
		: "Conta pra Clara o que você precisa…";

	return (
		<div
			className="sticky bottom-0 border-t border-zinc-200 bg-white px-4 py-3 sm:px-6"
			style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
		>
			<div className="mx-auto flex max-w-2xl items-end gap-2">
				<textarea
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKey}
					placeholder={placeholder}
					rows={1}
					disabled={disabled}
					className={cn(
						"flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm",
						"placeholder:text-zinc-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100",
						"disabled:cursor-not-allowed disabled:opacity-60",
					)}
				/>
				<Button
					onClick={handleSend}
					disabled={disabled || value.trim() === ""}
					size="icon"
					className="h-10 w-10 shrink-0 rounded-full bg-violet-600 hover:bg-violet-700"
					aria-label="Enviar mensagem"
				>
					<Send className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Error banner

function ErrorBanner({ error }: { error: string }) {
	if (!error) return null;
	return (
		<div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
			<div className="mx-auto flex max-w-2xl items-start gap-2">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
				<span>{error}</span>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary side panel
//
// saas-admin doesn't pull in @radix-ui/react-dialog, so we render a
// drawer-style overlay manually rather than depend on shadcn Sheet.

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
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
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
		extracted.systems.length === 0;

	return (
		<div className="fixed inset-0 z-50 flex">
			<button
				type="button"
				className="flex-1 bg-zinc-900/30 backdrop-blur-sm"
				aria-label="Fechar painel"
				onClick={onClose}
			/>
			<aside className="flex w-full max-w-sm flex-col bg-white shadow-xl sm:max-w-md">
				<div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
					<div>
						<p className="text-sm font-medium text-zinc-900">O que a Clara entendeu</p>
						<p className="text-xs text-zinc-500">
							A Clara salva isso enquanto vocês conversam.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"
						aria-label="Fechar"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-5 py-4">
					{empty ? (
						<div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
							<EmptyPanel />
						</div>
					) : (
						<dl className="space-y-4">
							<SummarySection
								label="Quem"
								items={[extracted.contactName, extracted.companyName].filter(Boolean) as string[]}
								icon={<CheckCircle2 className="h-3.5 w-3.5" />}
							/>
							<SummarySection label="Negócio" items={extracted.segments} />
							<SummarySection label="Canais" items={extracted.channels} />
							<SummarySection label="Dores" items={extracted.pains} />
							<SummarySection label="Sistemas" items={extracted.systems} />
						</dl>
					)}
				</div>
			</aside>
		</div>
	);
}

function SummarySection({
	label,
	items,
	icon,
}: {
	label: string;
	items: string[];
	icon?: React.ReactNode;
}) {
	if (items.length === 0) return null;
	return (
		<div>
			<dt className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
				{icon}
				{label}
			</dt>
			<dd className="flex flex-wrap gap-1.5">
				{items.map((it) => (
					<Chip key={it}>{it}</Chip>
				))}
			</dd>
		</div>
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Extracted merge: prefer server snapshot, fall back to live mirror

function mergeExtracted(server: ClaraExtracted, live: ClaraExtracted): ClaraExtracted {
	const pick = (s: string[], l: string[]) => (s.length > 0 ? s : l);
	return {
		companyName: server.companyName || live.companyName,
		contactName: server.contactName || live.contactName,
		segments: pick(server.segments, live.segments),
		channels: pick(server.channels, live.channels),
		pains: pick(server.pains, live.pains),
		systems: pick(server.systems, live.systems),
	};
}
