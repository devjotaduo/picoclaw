// ClaraDone is the closing screen after a successful submitPublicIntake. It
// intentionally avoids "thank you / we'll get back to you" boilerplate and
// instead reassures the lead that the message landed somewhere a human will
// see, plus gives them a quick way back to the conversation if they remember
// something else.

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { type SubmittedIntake } from "@/api/company-intakes";

import { STORAGE_KEY } from "../constants";
import { friendlyURL, ProvisionSuccessCard } from "./ProvisionSuccessCard";

export type ClaraDoneProps = {
	/** Pre-extracted display name, when the agent caught it during chat. */
	contactName?: string;
	/** Backend response from submitPublicIntake — carries tenant_provisioned, url, login_mode, initial_password. */
	submitted?: SubmittedIntake | null;
};

export function ClaraDone({ contactName, submitted }: ClaraDoneProps) {
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

	if (submitted && submitted.tenant_provisioned === false) {
		const errorDetail = submitted.provision_error?.trim()
			? submitted.provision_error
			: "Houve um problema ao preparar seu workspace. Verifique seu email — se Sofia te chamou, prosseguimos por lá.";
		return (
			<div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-6">
				<div className="max-w-md text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
						<AlertCircle className="h-7 w-7 text-rose-600" />
					</div>
					<h1 className="mt-4 text-xl font-semibold text-zinc-900">{greeting}</h1>
					<p className="mt-2 text-sm text-zinc-600">
						Recebemos seu pré-cadastro, mas não consegui preparar o painel agora.
						A equipe já recebeu o aviso e a <strong>Sofia</strong> vai te chamar no
						WhatsApp em breve.
					</p>
					<p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs text-rose-900">
						{errorDetail}
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

	if (submitted && submitted.tenant_provisioned && submitted.url) {
		const url = submitted.url;
		const email = submitted.contact_email || "";
		const isMagicLink = submitted.login_mode === "magic_link";
		const alreadyExists = submitted.tenant_already_exists === true;

		return (
			<div className="flex min-h-[100dvh] flex-col bg-zinc-50">
				<header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
					<div className="mx-auto flex max-w-3xl items-center gap-2 text-sm font-medium text-zinc-900">
						<CheckCircle2 className="h-4 w-4 text-emerald-600" />
						{greeting}
					</div>
				</header>
				<main className="flex-1">
					{alreadyExists ? (
						<ProvisionSuccessCard
							title="Você já tem painel ativo"
							subtitle={`Está em ${friendlyURL(url)}`}
							url={url}
							email={email}
							secondaryLine="Use o link que você já recebeu no email para entrar."
						/>
					) : isMagicLink ? (
						<ProvisionSuccessCard
							title="Seu painel está pronto"
							subtitle={`Está em ${friendlyURL(url)}`}
							url={url}
							email={email}
							secondaryLine={
								submitted.check_email
									? "Acabei de mandar um link de acesso no seu email."
									: undefined
							}
							resend={
								submitted.check_email && submitted.resume_token
									? {
											intakeId: submitted.id,
											resumeToken: submitted.resume_token,
											email,
										}
									: undefined
							}
						/>
					) : (
						<ProvisionSuccessCard
							title="Seu painel está pronto"
							subtitle={`Está em ${friendlyURL(url)}`}
							url={url}
							email={email}
							password={submitted.initial_password}
						/>
					)}
					<div className="mx-auto mt-6 max-w-3xl px-4 text-center sm:px-6">
						<p className="text-sm text-zinc-600">
							A <strong>Sofia</strong> te recebe lá no painel pra fechar os
							detalhes (horário, regra de preço, FAQs).
						</p>
						<button
							type="button"
							onClick={handleReset}
							className="mt-4 text-sm text-violet-600 underline-offset-2 hover:underline"
						>
							Quero conversar de novo
						</button>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 px-6">
			<div className="max-w-md text-center">
				<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
					<CheckCircle2 className="h-7 w-7 text-emerald-600" />
				</div>
				<h1 className="mt-4 text-xl font-semibold text-zinc-900">{greeting}</h1>
				<p className="mt-2 text-sm text-zinc-600">
					Já salvei o resuminho aqui. A <strong>Sofia</strong> vai te chamar no
					WhatsApp em breve pra alinhar os detalhes técnicos (preços, integrações,
					esses pormenores). Não precisa fazer mais nada agora.
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
