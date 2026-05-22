// Polling bridge for the public-onboarding-tenant flow.
//
// When useClaraChat routes the chat through the public-onboarding tenant
// (Phase 10 wire-up), the tenant only emits raw {text:"..."} chunks — the
// `extracted` / `qualified` / `tenant_provisioned` events that the
// in-controlplane Clara used to stream inline don't reach the browser any
// more. The tenant's onboarding-mark-qualified / onboarding-submit-intake
// skills do still HMAC-callback the controlplane and update the intake
// row; this module polls that row and turns its diffs into the same
// typed events the legacy hook already knows how to render.
//
// Tradeoffs vs. server-side enrichment (the alternative path discussed in
// docs/architecture/public-onboarding-tenant.md):
//   * cheap to ship — no agent/bus/channel changes
//   * latency is the poll interval (default 2.5s)
//   * one tiny GET per tick — same endpoint the legacy resume flow
//     already calls, so no new infra surface
//
// The hook is a pure function returning a controller; React wiring goes
// at the call site so this stays unit-testable without DOM.

import { getPublicIntake, type CompanyIntake } from "@/api/company-intakes";

export type IntakePollEvent =
	| { type: "extracted"; snapshot: Record<string, unknown> }
	| { type: "qualified"; qualifiedAt: string }
	| {
		type: "tenant_provisioned";
		url: string;
		subdomain: string;
		loginMode: "password" | "magic_link";
	};

export type OnboardingIntakePolling = {
	/** Stop the polling loop. Idempotent. */
	stop: () => void;
	/** Resolves when polling stops (terminal event or stop()). */
	done: Promise<void>;
};

export type OpenOnboardingIntakePollingOptions = {
	intakeId: string;
	resumeToken: string;
	onEvent: (e: IntakePollEvent) => void;
	/** Poll interval in ms. Default 2500. Clamped to >=500. */
	intervalMs?: number;
	/**
	 * Initial snapshot to diff against on the first poll, if the caller
	 * already has the intake loaded. When omitted, the first poll is
	 * treated as the baseline and only future changes emit events.
	 */
	initial?: CompanyIntake | null;
	/**
	 * Override fetcher for tests. Defaults to getPublicIntake.
	 */
	fetchFn?: (id: string, resumeToken: string) => Promise<CompanyIntake>;
	/**
	 * Optional setTimeout override for tests. Receives the ms delay and a
	 * callback; must return a cleanup function. Defaults to global
	 * setTimeout/clearTimeout.
	 */
	scheduler?: (ms: number, cb: () => void) => () => void;
};

/**
 * openOnboardingIntakePolling starts an intake polling loop that emits
 * `extracted` / `qualified` / `tenant_provisioned` events derived from
 * row-level diffs.
 *
 * Terminal state: after a `tenant_provisioned` event fires the loop
 * stops automatically — provisioning is a one-shot transition and any
 * further updates would be cleanup noise.
 */
export function openOnboardingIntakePolling(
	opts: OpenOnboardingIntakePollingOptions,
): OnboardingIntakePolling {
	const interval = Math.max(500, opts.intervalMs ?? 2500);
	const fetchFn = opts.fetchFn ?? getPublicIntake;
	const scheduler = opts.scheduler ?? defaultScheduler;

	let stopped = false;
	let cancelTick: (() => void) | null = null;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((res) => {
		resolveDone = res;
	});

	let prev: CompanyIntake | null = opts.initial ?? null;
	let emittedQualified = prev?.qualified_at ? true : false;
	let emittedProvisioned = prev?.linked_tenant_id ? true : false;

	const tick = async () => {
		if (stopped) return;
		let next: CompanyIntake;
		try {
			next = await fetchFn(opts.intakeId, opts.resumeToken);
		} catch {
			// Transient errors keep the loop alive — the visitor would
			// rather see a delayed "qualified" badge than a hard fail on
			// the first 502.
			schedule();
			return;
		}

		emitDiff(prev, next);
		prev = next;

		if (emittedProvisioned || stopped) {
			finish();
			return;
		}
		schedule();
	};

	const schedule = () => {
		if (stopped) return;
		cancelTick = scheduler(interval, () => {
			cancelTick = null;
			void tick();
		});
	};

	const finish = () => {
		if (stopped) return;
		stopped = true;
		if (cancelTick) {
			cancelTick();
			cancelTick = null;
		}
		resolveDone();
	};

	const emitDiff = (before: CompanyIntake | null, after: CompanyIntake) => {
		// extracted — emit when the answers payload actually changes.
		// Stable JSON.stringify is good enough here because the server
		// emits stable key ordering for the public response.
		if (
			before == null ||
			JSON.stringify(before.answers ?? {}) !==
				JSON.stringify(after.answers ?? {})
		) {
			opts.onEvent({ type: "extracted", snapshot: after.answers ?? {} });
		}

		// qualified — fire once on the null→string transition. We dedupe
		// across the lifetime of the controller so a flapping qualified_at
		// (shouldn't happen, but defense in depth) doesn't spam the UI.
		if (!emittedQualified && after.qualified_at) {
			emittedQualified = true;
			opts.onEvent({ type: "qualified", qualifiedAt: after.qualified_at });
		}

		// tenant_provisioned — same dedup rule. We need linked_tenant_id
		// AND a resolved URL; the backend fills tenant_url synchronously
		// when the FK is set, but degrade gracefully if it's missing.
		if (!emittedProvisioned && after.linked_tenant_id && after.tenant_url) {
			emittedProvisioned = true;
			const loginMode: "password" | "magic_link" =
				after.tenant_login_mode === "magic_link" ? "magic_link" : "password";
			opts.onEvent({
				type: "tenant_provisioned",
				url: after.tenant_url,
				subdomain: after.tenant_subdomain ?? "",
				loginMode,
			});
		}
	};

	// First poll runs immediately so the visitor doesn't wait an
	// interval to see whatever's already on the row when the hook
	// mounts. After that we settle into the scheduled cadence.
	void tick();

	return {
		stop: finish,
		done,
	};
}

function defaultScheduler(ms: number, cb: () => void): () => void {
	const handle = setTimeout(cb, ms);
	return () => clearTimeout(handle);
}
