// ClaraDone is the closing screen after a successful submitPublicIntake. It
// intentionally avoids "thank you / we'll get back to you" boilerplate and
// instead reassures the lead that the message landed somewhere a human will
// see, plus gives them a quick way back to the conversation if they remember
// something else.

import { CheckCircle2 } from "lucide-react";

import { STORAGE_KEY } from "../constants";

export type ClaraDoneProps = {
	/** Pre-extracted display name, when the agent caught it during chat. */
	contactName?: string;
};

export function ClaraDone({ contactName }: ClaraDoneProps) {
	const handleReset = () => {
		// Forget the local draft so the visitor lands on a fresh agent next
		// time and the resume URL doesn't reload a submitted intake.
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
		// Strip ?id=...&token=... so the next visit starts a new conversation.
		const url = window.location.pathname + window.location.hash;
		window.location.assign(url);
	};

	const greeting = contactName ? `Obrigada, ${contactName}!` : "Tudo certo!";

	return (
		<div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-6">
			<div className="max-w-md text-center">
				<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
					<CheckCircle2 className="h-7 w-7 text-emerald-600" />
				</div>
				<h1 className="mt-4 text-xl font-semibold text-zinc-900">{greeting}</h1>
				<p className="mt-2 text-sm text-zinc-600">
					Recebi tudo aqui. Vou desenhar uma proposta inicial e nosso time entra em
					contato pelo seu canal preferido em pouco tempo.
				</p>

				<button
					type="button"
					onClick={handleReset}
					className="mt-6 text-sm text-violet-600 underline-offset-2 hover:underline"
				>
					Quero conversar de novo
				</button>
			</div>
		</div>
	);
}
