import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

export type ProvisionSuccessCardProps = {
	title: string;
	subtitle: string;
	url: string;
	email: string;
	password?: string;
	secondaryLine?: string;
	resend?: { intakeId: string; resumeToken: string; email: string };
};

export function ProvisionSuccessCard({
	title,
	subtitle,
	url,
	email,
	password,
	secondaryLine,
	resend,
}: ProvisionSuccessCardProps) {
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

export function friendlyURL(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
