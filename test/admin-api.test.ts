import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.ts";
import {
	type AdminApi,
	createAdminApi,
	createChannelStateTracker,
	createUnpairAction,
	type ChannelSnapshot,
} from "../src/admin-api.ts";
import type { ChannelTransport, TransportStateEvent } from "../src/whatsapp.ts";

const OWNER_NUMBER = "5491112345678";
const VERIFY_TEXT = "👋 dot-whatsapp vinculado";

/** Minimal fake transport with spies; state events are applied to the tracker directly. */
function fakeTransport(overrides?: {
	sendText?: (to: string, text: string) => Promise<void>;
}) {
	const calls = { start: 0, stop: 0, sent: [] as Array<{ to: string; text: string }> };
	const transport: ChannelTransport = {
		async start() {
			calls.start += 1;
		},
		onMessage() {},
		async sendText(to, text) {
			if (overrides?.sendText) return overrides.sendText(to, text);
			calls.sent.push({ to, text });
		},
		async stop() {
			calls.stop += 1;
		},
	};
	return { transport, calls };
}

interface Harness {
	admin: AdminApi;
	base: string;
	tracker: ReturnType<typeof createChannelStateTracker>;
	allowlist: Set<string>;
	calls: ReturnType<typeof fakeTransport>["calls"];
	unpairCalls: { count: number };
	tokenFile: string;
	authDir: string;
	dir: string;
}

function startHarness(overrides?: {
	sendText?: (to: string, text: string) => Promise<void>;
	snapshot?: () => ChannelSnapshot;
}): Harness {
	const dir = mkdtempSync(join(tmpdir(), "dot-wa-admin-"));
	const tokenFile = join(dir, "admin-token");
	const authDir = join(dir, "auth");
	mkdirSync(authDir, { recursive: true, mode: 0o700 });
	const { transport, calls } = fakeTransport({ sendText: overrides?.sendText });
	const tracker = createChannelStateTracker({ provider: "baileys" });
	const allowlist = new Set([OWNER_NUMBER]);
	const unpairCalls = { count: 0 };
	const admin = createAdminApi({
		port: 0,
		provider: "baileys",
		tokenFile,
		transport,
		allowlist,
		state: overrides?.snapshot ?? (() => tracker.snapshot()),
		unpair: async () => {
			unpairCalls.count += 1;
		},
		log: () => {},
	});
	return { admin, base: "", tracker, allowlist, calls, unpairCalls, tokenFile, authDir, dir };
}

async function started(overrides?: Parameters<typeof startHarness>[0]): Promise<Harness> {
	const h = startHarness(overrides);
	await h.admin.start();
	(h as { base: string }).base = `http://127.0.0.1:${h.admin.port()}`;
	return h;
}

async function call(base: string, path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${base}${path}`, init);
}

function authHeaders(tokenFile: string): HeadersInit {
	return { authorization: `Bearer ${readFileSync(tokenFile, "utf8").trim()}` };
}

let open: Harness | undefined;
afterEach(async () => {
	if (open) await open.admin.stop();
	if (open) rmSync(open.dir, { recursive: true, force: true });
	open = undefined;
});

describe("admin API config", () => {
	it("defaults DOT_WHATSAPP_ADMIN_PORT to 4407 and exposes the token file default", () => {
		const config = loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: OWNER_NUMBER }, "/home/x");
		expect(config.adminPort).toBe(4407);
		expect(config.adminTokenFile).toBe("/home/x/.dot-whatsapp/admin-token");
	});

	it("accepts a custom admin port and rejects invalid values", () => {
		const ok = loadConfig(
			{ DOT_WHATSAPP_ALLOWED_NUMBERS: OWNER_NUMBER, DOT_WHATSAPP_ADMIN_PORT: "4500" },
			"/home/x",
		);
		expect(ok.adminPort).toBe(4500);
		expect(() =>
			loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: OWNER_NUMBER, DOT_WHATSAPP_ADMIN_PORT: "nope" }, "/home/x"),
		).toThrow(ConfigError);
	});
});

describe("admin API token auth", () => {
	it("creates the token file 0600 and refuses missing or wrong bearer tokens", async () => {
		const h = (open = await started());
		const mode = statSync(h.tokenFile).mode & 0o777;
		expect(mode).toBe(0o600);

		const noAuth = await call(h.base, "/status");
		expect(noAuth.status).toBe(401);

		const bad = await call(h.base, "/status", { headers: { authorization: "Bearer nope" } });
		expect(bad.status).toBe(401);
	});

	it("re-reads the token on every request (rotation works without restart)", async () => {
		const h = (open = await started());
		const rotated = "rotated-token-value-1234567890";
		writeFileSync(h.tokenFile, `${rotated}\n`, { mode: 0o600 });

		const oldToken = await call(h.base, "/status", {
			headers: { authorization: `Bearer stale-token-value-000000` },
		});
		expect(oldToken.status).toBe(401);

		const fresh = await call(h.base, "/status", { headers: { authorization: `Bearer ${rotated}` } });
		expect(fresh.status).toBe(200);
	});
});

describe("admin API status and masking", () => {
	it("reports the S6 status shape with the number masked server-side", async () => {
		const h = (open = await started());
		h.tracker.apply({ kind: "open", number: OWNER_NUMBER });
		h.tracker.apply({ kind: "activity" });

		const res = await call(h.base, "/status", { headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toEqual({
			state: "connected",
			provider: "baileys",
			maskedNumber: `…${OWNER_NUMBER.slice(-4)}`,
			lastActivityAt: expect.any(String),
		});
		expect(JSON.stringify(body)).not.toContain(OWNER_NUMBER);
	});

	it("defaults to state off with no masked number", async () => {
		const h = (open = await started());
		const body = (await (await call(h.base, "/status", { headers: authHeaders(h.tokenFile) })).json()) as Record<
			string,
			unknown
		>;
		expect(body.state).toBe("off");
		expect(body.maskedNumber).toBeNull();
		expect(body.lastActivityAt).toBeNull();
	});

	it("returns 404 for unknown routes", async () => {
		const h = (open = await started());
		const res = await call(h.base, "/nope", { headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(404);
	});
});

describe("admin API allowlist (hot, masked)", () => {
	it("lists masked entries only", async () => {
		const h = (open = await started());
		const body = (await (await call(h.base, "/allowlist", { headers: authHeaders(h.tokenFile) })).json()) as {
			numbers: string[];
		};
		expect(body.numbers).toEqual([`…${OWNER_NUMBER.slice(-4)}`]);
	});

	it("adds a number to the shared set (hot apply) and never echoes it back in full", async () => {
		const h = (open = await started());
		const added = "5499998765432";
		const res = await call(h.base, "/allowlist", {
			method: "POST",
			headers: { ...authHeaders(h.tokenFile), "content-type": "application/json" },
			body: JSON.stringify({ action: "add", number: added }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { numbers: string[] };
		expect(h.allowlist.has(added)).toBe(true);
		expect(body.numbers).toContain(`…${added.slice(-4)}`);
		expect(JSON.stringify(body)).not.toContain(added);
	});

	it("removes a number and rejects invalid numbers and malformed bodies", async () => {
		const h = (open = await started());
		const remove = await call(h.base, "/allowlist", {
			method: "POST",
			headers: { ...authHeaders(h.tokenFile), "content-type": "application/json" },
			body: JSON.stringify({ action: "remove", number: OWNER_NUMBER }),
		});
		expect(remove.status).toBe(200);
		expect(h.allowlist.has(OWNER_NUMBER)).toBe(false);

		const invalid = await call(h.base, "/allowlist", {
			method: "POST",
			headers: { ...authHeaders(h.tokenFile), "content-type": "application/json" },
			body: JSON.stringify({ action: "add", number: "hello" }),
		});
		expect(invalid.status).toBe(400);

		const malformed = await call(h.base, "/allowlist", {
			method: "POST",
			headers: { ...authHeaders(h.tokenFile), "content-type": "application/json" },
			body: "not json",
		});
		expect(malformed.status).toBe(400);
	});
});

describe("admin API pairing", () => {
	it("pair/start is refused unless the channel is off or in error", async () => {
		const h = (open = await started());
		h.tracker.apply({ kind: "open", number: OWNER_NUMBER });
		const res = await call(h.base, "/pair/start", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(409);
	});

	it("pair/start restarts the transport when off and pair/status exposes the QR from the snapshot", async () => {
		const h = (open = await started());
		const res = await call(h.base, "/pair/start", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(200);
		expect(h.calls.start).toBe(1);

		h.tracker.apply({ kind: "qr", qr: "2@QrPayloadABC==" });
		const qr = (await (await call(h.base, "/pair/status", { headers: authHeaders(h.tokenFile) })).json()) as {
			qr: string | null;
			expiresInSec: number;
			attempts: number;
		};
		expect(qr.qr).toBe("2@QrPayloadABC==");
		expect(qr.expiresInSec).toBeGreaterThan(0);
		expect(qr.attempts).toBe(1);
	});

	it("pair/status returns a null qr outside pairing", async () => {
		const h = (open = await started());
		const body = (await (await call(h.base, "/pair/status", { headers: authHeaders(h.tokenFile) })).json()) as {
			qr: string | null;
		};
		expect(body.qr).toBeNull();
	});

	it("pair/regenerate and pair/cancel are refused outside pairing", async () => {
		const h = (open = await started());
		const regen = await call(h.base, "/pair/regenerate", { method: "POST", headers: authHeaders(h.tokenFile) });
		const cancel = await call(h.base, "/pair/cancel", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(regen.status).toBe(409);
		expect(cancel.status).toBe(409);
	});

	it("pair/regenerate restarts pairing while pairing; pair/cancel stops it", async () => {
		const h = (open = await started());
		h.tracker.apply({ kind: "qr", qr: "first" });
		await call(h.base, "/pair/regenerate", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(h.calls.stop).toBe(1);
		expect(h.calls.start).toBe(1);

		await call(h.base, "/pair/cancel", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(h.calls.stop).toBe(2);
	});
});

describe("admin API verify and unpair", () => {
	it("verify is refused unless connected", async () => {
		const h = (open = await started());
		const res = await call(h.base, "/verify", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(409);
	});

	it("verify sends the greeting to every allowlisted number and reports masked results", async () => {
		const h = (open = await started());
		h.allowlist.add("5499998765432");
		h.tracker.apply({ kind: "open", number: OWNER_NUMBER });

		const res = await call(h.base, "/verify", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ masked: string; ok: boolean }> };
		expect(h.calls.sent).toEqual([
			{ to: OWNER_NUMBER, text: VERIFY_TEXT },
			{ to: "5499998765432", text: VERIFY_TEXT },
		]);
		expect(body.results).toHaveLength(2);
		expect(body.results.every((r) => r.ok)).toBe(true);
		expect(JSON.stringify(body)).not.toContain(OWNER_NUMBER);
	});

	it("verify reports a failed send as ok:false instead of throwing", async () => {
		const h = (open = await started({
			sendText: async (to) => {
				if (to === OWNER_NUMBER) throw new Error("socket down");
			},
		}));
		h.tracker.apply({ kind: "open", number: OWNER_NUMBER });

		const res = await call(h.base, "/verify", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ masked: string; ok: boolean }> };
		expect(body.results[0]).toEqual({ masked: `…${OWNER_NUMBER.slice(-4)}`, ok: false });
	});

	it("unpair delegates to the wired unpair action and returns 200", async () => {
		const h = (open = await started());
		const res = await call(h.base, "/unpair", { method: "POST", headers: authHeaders(h.tokenFile) });
		expect(res.status).toBe(200);
		expect(h.unpairCalls.count).toBe(1);
	});
});

describe("unpair action", () => {
	it("stops the transport and clears the auth dir (injected path only)", async () => {
		const dir = mkdtempSync(join(tmpdir(), "dot-wa-unpair-"));
		try {
			const authDir = join(dir, "auth");
			mkdirSync(authDir, { recursive: true, mode: 0o700 });
			writeFileSync(join(authDir, "creds.json"), "{}");
			const { transport, calls } = fakeTransport();
			const tracker = createChannelStateTracker({ provider: "baileys" });
			tracker.apply({ kind: "open", number: OWNER_NUMBER });

			const unpair = createUnpairAction({ authDir, transport, tracker, log: () => {} });
			await unpair();

			expect(calls.stop).toBe(1);
			expect(() => statSync(authDir)).toThrow();
			expect(tracker.snapshot().state).toBe("off");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("channel state tracker", () => {
	it("maps transport events to the admin states", () => {
		const tracker = createChannelStateTracker({ provider: "baileys" });
		expect(tracker.snapshot().state).toBe("off");

		tracker.apply({ kind: "qr", qr: "one" });
		expect(tracker.snapshot().state).toBe("pairing");
		expect(tracker.snapshot().qrAttempts).toBe(1);

		tracker.apply({ kind: "qr", qr: "two" });
		expect(tracker.snapshot().qrAttempts).toBe(2);

		tracker.apply({ kind: "open", number: OWNER_NUMBER });
		const openSnap = tracker.snapshot();
		expect(openSnap.state).toBe("connected");
		expect(openSnap.botNumber).toBe(OWNER_NUMBER); // raw internally; masked only at the HTTP edge

		tracker.apply({ kind: "close", reason: "logged_out" });
		expect(tracker.snapshot().state).toBe("error");

		tracker.apply({ kind: "close", reason: "stopped" });
		expect(tracker.snapshot().state).toBe("off");
	});

	it("keeps events of every kind typed as TransportStateEvent", () => {
		const events: TransportStateEvent[] = [
			{ kind: "qr", qr: "x" },
			{ kind: "open", number: "1" },
			{ kind: "close", reason: "reconnecting" },
			{ kind: "close", reason: "logged_out" },
			{ kind: "close", reason: "stopped" },
			{ kind: "error", message: "boom" },
		];
		const tracker = createChannelStateTracker({ provider: "baileys" });
		for (const event of events) tracker.apply(event);
		expect(tracker.snapshot().state).toBe("error");
	});
});
