import { describe, expect, it, vi } from "vitest";

import {
	openOnboardingIntakePolling,
	type IntakePollEvent,
} from "@/pages/pre-cadastro/clara/onboardingIntakePolling";
import type { CompanyIntake } from "@/api/company-intakes";

// Minimal intake factory: just enough fields for the polling hook to do
// its diffing. The hook ignores everything else, so this stays terse.
function makeIntake(overrides: Partial<CompanyIntake> = {}): CompanyIntake {
	return {
		id: "intake-1",
		status: "draft",
		company_name: "",
		contact_name: "",
		contact_email: "",
		contact_whatsapp: "",
		answers: {},
		attachments: [],
		created_at: "2026-05-21T00:00:00Z",
		updated_at: "2026-05-21T00:00:00Z",
		...overrides,
	};
}

// makeScheduler returns a scheduler stub plus a `flush()` that drains the
// queued callback. Letting the test drive ticks explicitly removes the
// need for fake timers and keeps assertions linear.
function makeScheduler() {
	let queued: (() => void) | null = null;
	let lastDelayMs = 0;
	const scheduler = (ms: number, cb: () => void) => {
		lastDelayMs = ms;
		queued = cb;
		return () => {
			if (queued === cb) queued = null;
		};
	};
	const flush = async () => {
		const fn = queued;
		queued = null;
		if (fn) fn();
		// Yield so the async tick inside the hook can settle before the
		// next assertion runs.
		await Promise.resolve();
		await Promise.resolve();
	};
	const hasPending = () => queued !== null;
	return {
		scheduler,
		flush,
		hasPending,
		get lastDelayMs() {
			return lastDelayMs;
		},
	};
}

describe("openOnboardingIntakePolling", () => {
	it("emits `extracted` on the first poll and again only when answers change", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn();
		fetchFn.mockResolvedValueOnce(makeIntake({ answers: { company_name: "Acme" } }));
		fetchFn.mockResolvedValueOnce(makeIntake({ answers: { company_name: "Acme" } }));
		fetchFn.mockResolvedValueOnce(
			makeIntake({ answers: { company_name: "Acme", pains: ["latency"] } }),
		);

		const events: IntakePollEvent[] = [];
		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: (e) => events.push(e),
			fetchFn,
			scheduler: sched.scheduler,
		});

		// First tick runs immediately on open.
		await Promise.resolve();
		await Promise.resolve();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("extracted");

		await sched.flush(); // second tick — no diff, no event
		expect(events).toHaveLength(1);

		await sched.flush(); // third tick — answers changed, new extracted event
		expect(events).toHaveLength(2);
		expect(events[1]).toEqual({
			type: "extracted",
			snapshot: { company_name: "Acme", pains: ["latency"] },
		});

		ctl.stop();
		await ctl.done;
	});

	it("emits `qualified` exactly once on the null→string transition", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn();
		fetchFn.mockResolvedValueOnce(makeIntake({ qualified_at: null }));
		fetchFn.mockResolvedValueOnce(
			makeIntake({ qualified_at: "2026-05-21T01:00:00Z" }),
		);
		fetchFn.mockResolvedValueOnce(
			makeIntake({ qualified_at: "2026-05-21T01:00:00Z" }),
		);

		const events: IntakePollEvent[] = [];
		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: (e) => events.push(e),
			fetchFn,
			scheduler: sched.scheduler,
		});

		await Promise.resolve();
		await Promise.resolve();
		await sched.flush();
		await sched.flush();

		const qualified = events.filter((e) => e.type === "qualified");
		expect(qualified).toHaveLength(1);
		expect((qualified[0] as { qualifiedAt: string }).qualifiedAt).toBe(
			"2026-05-21T01:00:00Z",
		);

		ctl.stop();
		await ctl.done;
	});

	it("emits `tenant_provisioned` and terminates the loop", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn();
		fetchFn.mockResolvedValueOnce(
			makeIntake({ qualified_at: "2026-05-21T01:00:00Z" }),
		);
		fetchFn.mockResolvedValueOnce(
			makeIntake({
				qualified_at: "2026-05-21T01:00:00Z",
				linked_tenant_id: "tenant-xyz",
				tenant_url: "https://acme.jotaduo.com",
				tenant_subdomain: "acme",
				tenant_login_mode: "password",
				contact_email: "owner@acme.com",
			}),
		);

		const events: IntakePollEvent[] = [];
		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: (e) => events.push(e),
			fetchFn,
			scheduler: sched.scheduler,
		});

		await Promise.resolve();
		await Promise.resolve();
		await sched.flush();

		const provisioned = events.find((e) => e.type === "tenant_provisioned");
		expect(provisioned).toEqual({
			type: "tenant_provisioned",
			url: "https://acme.jotaduo.com",
			subdomain: "acme",
			email: "owner@acme.com",
			loginMode: "password",
		});

		// After tenant_provisioned the loop must self-terminate. `done`
		// already resolves; no further ticks should be scheduled.
		await ctl.done;
		expect(sched.hasPending()).toBe(false);
	});

	it("does NOT emit tenant_provisioned when tenant_url is missing", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn();
		fetchFn.mockResolvedValueOnce(
			makeIntake({ linked_tenant_id: "tenant-xyz", tenant_url: "" }),
		);

		const events: IntakePollEvent[] = [];
		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: (e) => events.push(e),
			fetchFn,
			scheduler: sched.scheduler,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(events.find((e) => e.type === "tenant_provisioned")).toBeUndefined();

		ctl.stop();
		await ctl.done;
	});

	it("survives transient fetch errors", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn();
		fetchFn.mockRejectedValueOnce(new Error("network"));
		fetchFn.mockResolvedValueOnce(makeIntake({ answers: { x: 1 } }));

		const events: IntakePollEvent[] = [];
		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: (e) => events.push(e),
			fetchFn,
			scheduler: sched.scheduler,
		});

		// First (errored) tick — no events, but a follow-up is scheduled.
		await Promise.resolve();
		await Promise.resolve();
		expect(events).toHaveLength(0);

		await sched.flush();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("extracted");

		ctl.stop();
		await ctl.done;
	});

	it("clamps the interval to a 500ms floor", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn().mockResolvedValue(makeIntake());

		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			intervalMs: 50, // requested floor, below the safety clamp
			onEvent: () => {},
			fetchFn,
			scheduler: sched.scheduler,
		});

		await Promise.resolve();
		await Promise.resolve();
		expect(sched.lastDelayMs).toBe(500);

		ctl.stop();
		await ctl.done;
	});

	it("stop() halts further fetches", async () => {
		const sched = makeScheduler();
		const fetchFn = vi.fn().mockResolvedValue(makeIntake());

		const ctl = openOnboardingIntakePolling({
			intakeId: "intake-1",
			resumeToken: "r",
			onEvent: () => {},
			fetchFn,
			scheduler: sched.scheduler,
		});

		await Promise.resolve();
		await Promise.resolve();
		expect(fetchFn).toHaveBeenCalledTimes(1);

		ctl.stop();
		// Even if a tick was queued, it's now cancelled.
		await sched.flush();
		expect(fetchFn).toHaveBeenCalledTimes(1);

		await ctl.done;
	});
});
