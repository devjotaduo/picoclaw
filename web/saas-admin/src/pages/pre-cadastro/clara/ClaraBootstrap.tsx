// ClaraBootstrap is the entry-point + state machine of the conversational
// agent. It owns the same intake-id / resume-token lifecycle as the legacy
// useIntakeCore (URL params first, localStorage second, otherwise create a
// fresh intake) so an A/B switch between the two flows never throws away a
// draft.
//
// View states:
//   * loading   — initial fetch / create
//   * error     — bootstrap failed (network, expired token, etc.)
//   * chat      — the agent is conversing with the visitor
//   * finalize  — agent fired mark_qualified; collect email/whatsapp + submit
//   * done      — intake submitted; thank-you screen with link to reset

import { useEffect, useState } from "react";

import {
	createPublicIntake,
	getPublicIntake,
	type CompanyIntake,
	type SubmittedIntake,
} from "@/api/company-intakes";

import { STORAGE_KEY } from "../constants";
import { ClaraChat } from "./ClaraChat";
import { ClaraDone } from "./ClaraDone";
import { ClaraFinalize } from "./ClaraFinalize";
import { extractFromIntake, type ClaraExtracted } from "./useClaraChat";

type View =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "chat"; intake: CompanyIntake; resumeToken: string }
	| {
			kind: "finalize";
			intake: CompanyIntake;
			resumeToken: string;
			extracted: ClaraExtracted;
			qualifiedReason: string;
	  }
	| { kind: "done"; contactName?: string; submitted: SubmittedIntake | null };

type BootstrapResult =
	| { kind: "chat"; intake: CompanyIntake; resumeToken: string }
	| { kind: "done"; contactName?: string; submitted: SubmittedIntake | null };

let bootstrapInFlight: Promise<BootstrapResult> | null = null;

export function ClaraBootstrap() {
	const [view, setView] = useState<View>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				bootstrapInFlight ??= bootstrapIntake().finally(() => {
					bootstrapInFlight = null;
				});
				const nextView = await bootstrapInFlight;
				if (cancelled) return;
				setView(nextView);
			} catch (err) {
				localStorage.removeItem(STORAGE_KEY);
				if (cancelled) return;
				setView({
					kind: "error",
					message: err instanceof Error ? err.message : "não consegui iniciar a conversa",
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (view.kind === "loading") {
		return (
			<div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50">
				<p className="text-sm text-zinc-500">Preparando a Clara…</p>
			</div>
		);
	}

	if (view.kind === "error") {
		return (
			<div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-6">
				<div className="max-w-sm text-center">
					<p className="text-sm font-medium text-zinc-900">Não consegui abrir a conversa</p>
					<p className="mt-1 text-sm text-zinc-500">{view.message}</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="mt-4 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
					>
						Tentar de novo
					</button>
				</div>
			</div>
		);
	}

	if (view.kind === "done") {
		return <ClaraDone contactName={view.contactName} submitted={view.submitted} />;
	}

	if (view.kind === "finalize") {
		return (
			<ClaraFinalize
				intake={view.intake}
				resumeToken={view.resumeToken}
				extracted={view.extracted}
				qualifiedReason={view.qualifiedReason}
				onSubmitted={(result) => {
					setView({
						kind: "done",
						contactName: view.intake.contact_name || view.extracted.contactName,
						submitted: result,
					});
				}}
				onBack={() => {
					// Let the visitor add more context before submitting.
					setView({ kind: "chat", intake: view.intake, resumeToken: view.resumeToken });
				}}
			/>
		);
	}

	// view.kind === "chat"
	return (
		<ClaraChat
			intakeId={view.intake.id}
			resumeToken={view.resumeToken}
			contactName={view.intake.contact_name}
			companyName={view.intake.company_name}
			answers={(view.intake.answers as Record<string, unknown>) ?? {}}
			onQualified={(reason, extracted) => {
				setView({
					kind: "finalize",
					intake: view.intake,
					resumeToken: view.resumeToken,
					extracted: mergeWithHydrated(view.intake, extracted),
					qualifiedReason: reason,
				});
			}}
		/>
	);
}

async function bootstrapIntake(): Promise<BootstrapResult> {
	const params = new URLSearchParams(window.location.search);
	const urlId = params.get("id");
	const urlToken = params.get("token");
	const stored = readStorage();
	const id = urlId ?? stored.id;
	const token = urlToken ?? stored.token;

	if (id && token) {
		const intake = await getPublicIntake(id, token);
		persist(intake.id, token);
		syncUrl(intake.id, token);
		// Skip the chat if the intake was already submitted.
		if (intake.status === "submitted" || intake.status === "reviewed" || intake.status === "linked") {
			const submitted: SubmittedIntake | null = intake.tenant_url
				? {
						...intake,
						tenant_provisioned: true,
						url: intake.tenant_url,
						subdomain: intake.tenant_subdomain,
						login_mode: "magic_link",
						check_email: true,
					}
				: null;
			return { kind: "done", contactName: intake.contact_name || undefined, submitted };
		}
		return { kind: "chat", intake, resumeToken: token };
	}

	const created = await createPublicIntake();
	const newToken = created.resume_token ?? "";
	if (!newToken) {
		throw new Error("intake criado sem resume_token");
	}
	persist(created.id, newToken);
	syncUrl(created.id, newToken);
	return { kind: "chat", intake: created, resumeToken: newToken };
}

// mergeWithHydrated brings in fields the agent didn't touch this turn (e.g.
// answers already persisted from a previous session) so the finalize summary
// is complete.
function mergeWithHydrated(intake: CompanyIntake, live: ClaraExtracted): ClaraExtracted {
	const hydrated = extractFromIntake(
		(intake.answers as Record<string, unknown>) ?? {},
		intake.contact_name ?? "",
		intake.company_name ?? "",
	);
	const pick = (s: string[], l: string[]) => (s.length > 0 ? s : l);
	return {
		companyName: live.companyName || hydrated.companyName,
		contactName: live.contactName || hydrated.contactName,
		segments: pick(live.segments, hydrated.segments),
		channels: pick(live.channels, hydrated.channels),
		pains: pick(live.pains, hydrated.pains),
		systems: pick(live.systems, hydrated.systems),
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// storage helpers

function readStorage(): { id?: string; token?: string } {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return {};
		return JSON.parse(saved) as { id?: string; token?: string };
	} catch {
		return {};
	}
}

function persist(id: string, token: string) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, token }));
	} catch {
		// ignore quota / private-browsing failures
	}
}

function syncUrl(id: string, token: string) {
	const params = new URLSearchParams(window.location.search);
	if (params.get("id") === id && params.get("token") === token) return;
	params.set("id", id);
	params.set("token", token);
	const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
	window.history.replaceState({}, "", url);
}
