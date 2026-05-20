// PublicPreCadastro is the public entry-point for the pre-cadastro flow.
//
// The Sofia/Clara conversational agent is now the default. The legacy
// 22-step wizard stays available as an escape hatch via ?clara=0 — operators
// occasionally want to compare against the deterministic path when debugging
// the LLM, but visitors never see it on jotaduo.com/pre-cadastro.

import { ChatScreen } from "./chat/ChatScreen";
import { ClaraBootstrap } from "./clara/ClaraBootstrap";

function useLegacyWizard(): boolean {
	if (typeof window === "undefined") return false;
	const flag = new URLSearchParams(window.location.search).get("clara");
	return flag === "0" || flag === "false";
}

export function PublicPreCadastro() {
	if (useLegacyWizard()) {
		return <ChatScreen />;
	}
	return <ClaraBootstrap />;
}
