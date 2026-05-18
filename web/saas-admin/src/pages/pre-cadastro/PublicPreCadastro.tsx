// PublicPreCadastro is the public entry-point for the pre-cadastro flow.
//
// We expose an A/B switch between two implementations:
//   * "clara" — conversational agent backed by the saas-admin Clara endpoint.
//   * legacy  — the deterministic 22-step wizard (ChatScreen).
//
// Selection logic, in priority order:
//   1. URL query: ?clara=1 forces agent, ?clara=0 forces legacy
//   2. Vite env: VITE_CLARA_DEFAULT=true makes the agent the default
//   3. otherwise fall back to the legacy script-driven screen.
//
// Both flows share the same intake id + resume token via the picoclaw_pre_cadastro_clara
// localStorage key, so a user who flips between variants keeps their draft.

import { ChatScreen } from "./chat/ChatScreen";
import { ClaraBootstrap } from "./clara/ClaraBootstrap";

const CLARA_DEFAULT_ENV =
	String(import.meta.env?.VITE_CLARA_DEFAULT ?? "")
		.trim()
		.toLowerCase() === "true";

function shouldUseClara(): boolean {
	if (typeof window === "undefined") return CLARA_DEFAULT_ENV;
	const params = new URLSearchParams(window.location.search);
	const flag = params.get("clara");
	if (flag === "1" || flag === "true") return true;
	if (flag === "0" || flag === "false") return false;
	return CLARA_DEFAULT_ENV;
}

export function PublicPreCadastro() {
	if (shouldUseClara()) {
		return <ClaraBootstrap />;
	}
	return <ChatScreen />;
}
