/**
 * Local admin API for the dot-whatsapp bridge (feature doc S6): a small token-authed
 * JSON HTTP surface bound to 127.0.0.1 that lets the gentle-dot Channels panel drive
 * pairing, allowlist and teardown without shell access.
 *
 * Security posture:
 * - Binds 127.0.0.1 only. Bearer token lives in a 0600 file and is re-read on EVERY
 *   request (rotating the file takes effect immediately; nothing is cached).
 * - Numbers are masked server-side (last 4 digits, §8/S7); full E.164 digits never
 *   appear in any response body.
 * - Purely additive: the Baileys relay behavior is untouched.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { isValidE164 } from "./config.ts";
import type { ChannelTransport, TransportStateEvent } from "./whatsapp.ts";

export type AdminChannelState = "off" | "pairing" | "connected" | "error";
export type ProviderType = "baileys" | "meta-cloud";

/** The live-verification greeting the bridge sends to the allowlist (§8 step 4). */
export const VERIFY_TEXT = "👋 dot-whatsapp vinculado";

/** Baileys refreshes the pairing QR roughly every 20s; the UI countdown mirrors it. */
export const QR_TTL_SEC = 20;

/** Raw channel snapshot; `botNumber` is masked only at the HTTP edge. */
export interface ChannelSnapshot {
	state: AdminChannelState;
	provider: ProviderType;
	/** The bot's own E.164 digits (raw internally; never leaves the process unmasked). */
	botNumber: string | null;
	lastActivityAt: string | null;
	qr: string | null;
	qrExpiresAt: number | null;
	qrAttempts: number;
}

/** Maps transport connectivity events to the S6 states (off/pairing/connected/error). */
export function createChannelStateTracker(options: { provider: ProviderType }): {
	apply(event: TransportStateEvent): void;
	snapshot(): ChannelSnapshot;
	reset(): void;
} {
	const snap: ChannelSnapshot = {
		state: "off",
		provider: options.provider,
		botNumber: null,
		lastActivityAt: null,
		qr: null,
		qrExpiresAt: null,
		qrAttempts: 0,
	};
	return {
		apply(event) {
			snap.lastActivityAt = new Date().toISOString();
			switch (event.kind) {
				case "qr":
					snap.state = "pairing";
					snap.qr = event.qr;
					snap.qrAttempts += 1;
					snap.qrExpiresAt = Date.now() + QR_TTL_SEC * 1000;
					return;
				case "open":
					snap.state = "connected";
					snap.qr = null;
					snap.qrExpiresAt = null;
					if (event.number) snap.botNumber = event.number;
					return;
				case "activity":
					return;
				case "close":
					snap.qr = null;
					snap.qrExpiresAt = null;
					snap.state = event.reason === "logged_out" ? "error" : "off";
					return;
				case "error":
					snap.state = "error";
					return;
			}
		},
		snapshot() {
			return { ...snap };
		},
		reset() {
			snap.state = "off";
			snap.botNumber = null;
			snap.qr = null;
			snap.qrExpiresAt = null;
			snap.qrAttempts = 0;
			snap.lastActivityAt = null;
		},
	};
}

/** Last 4 digits only; the full number never crosses the HTTP edge (S7). */
export function maskNumber(number: string | null | undefined): string | null {
	if (!number) return null;
	return `…${number.slice(-4)}`;
}

export interface AdminApiOptions {
	port: number;
	provider: ProviderType;
	/** Path of the admin bearer token; created 0600 on start, re-read per request. */
	tokenFile: string;
	transport: ChannelTransport;
	/** Current channel snapshot (wired from the tracker in main.ts). */
	state(): ChannelSnapshot;
	/** The shared live allowlist set; mutations apply hot to bridge and transport. */
	allowlist: Set<string>;
	/** Teardown wired in main.ts (stop + clear auth dir + reset tracker). */
	unpair(): Promise<void>;
	/** Persistence hook (Engram snapshot); receives full digits — mask before logging. */
	onAllowlistChange?(numbers: string[]): void;
	log?(message: string): void;
}

export interface AdminApi {
	start(): Promise<void>;
	stop(): Promise<void>;
	port(): number;
}

export function createAdminApi(options: AdminApiOptions): AdminApi {
	const log = options.log ?? (() => {});

	let server: Server | undefined;

	const readBody = (req: IncomingMessage): Promise<string> =>
		new Promise((resolve, reject) => {
			let data = "";
			req.on("data", (chunk: Buffer) => {
				data += chunk.toString();
				if (data.length > 64 * 1024) reject(new Error("body too large"));
			});
			req.on("end", () => resolve(data));
			req.on("error", reject);
		});

	const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
		res.writeHead(status, { "content-type": "application/json" });
		res.end(JSON.stringify(body));
	};

	const currentToken = (): string => readFileSync(options.tokenFile, "utf8").trim();

	const authorized = (req: IncomingMessage): boolean => {
		const header = req.headers.authorization ?? "";
		const match = /^Bearer (.+)$/.exec(header);
		if (!match) return false;
		const expected = currentToken();
		const given = Buffer.from(match[1]);
		const want = Buffer.from(expected);
		return given.length === want.length && timingSafeEqual(given, want);
	};

	/** Restarts pairing from a dead/idle transport; the open socket (if any) is dropped first. */
	const restartTransport = async (): Promise<void> => {
		await options.transport.stop();
		await options.transport.start();
	};

	const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
		const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

		if (!authorized(req)) {
			sendJson(res, 401, { error: "unauthorized" });
			return;
		}

		const snap = options.state();

		if (req.method === "GET" && path === "/status") {
			sendJson(res, 200, {
				state: snap.state,
				provider: snap.provider,
				maskedNumber: maskNumber(snap.botNumber),
				lastActivityAt: snap.lastActivityAt,
			});
			return;
		}

		if (req.method === "GET" && path === "/allowlist") {
			sendJson(res, 200, { numbers: [...options.allowlist].map((n) => maskNumber(n)) });
			return;
		}

		if (req.method === "POST" && path === "/allowlist") {
			let body: { action?: string; number?: string };
			try {
				body = JSON.parse(await readBody(req)) as { action?: string; number?: string };
			} catch {
				sendJson(res, 400, { error: "invalid JSON body" });
				return;
			}
			const { action, number } = body;
			if (action !== "add" && action !== "remove") {
				sendJson(res, 400, { error: "action must be add or remove" });
				return;
			}
			if (typeof number !== "string" || !isValidE164(number)) {
				sendJson(res, 400, { error: "number must be a valid E.164 (digits only)" });
				return;
			}
			if (action === "add") options.allowlist.add(number);
			else options.allowlist.delete(number);
			const numbers = [...options.allowlist];
			options.onAllowlistChange?.(numbers);
			sendJson(res, 200, { numbers: numbers.map((n) => maskNumber(n)) });
			return;
		}

		if (req.method === "POST" && path === "/pair/start") {
			if (snap.state !== "off" && snap.state !== "error") {
				sendJson(res, 409, { error: `cannot start pairing from state ${snap.state}` });
				return;
			}
			await restartTransport();
			sendJson(res, 200, { ok: true });
			return;
		}

		if (req.method === "GET" && path === "/pair/status") {
			if (snap.state !== "pairing" || !snap.qr) {
				sendJson(res, 200, { qr: null, expiresInSec: 0, attempts: snap.qrAttempts });
				return;
			}
			const expiresInSec = Math.max(0, Math.ceil(((snap.qrExpiresAt ?? 0) - Date.now()) / 1000));
			sendJson(res, 200, { qr: snap.qr, expiresInSec, attempts: snap.qrAttempts });
			return;
		}

		if (req.method === "POST" && path === "/pair/regenerate") {
			if (snap.state !== "pairing") {
				sendJson(res, 409, { error: "not pairing" });
				return;
			}
			await restartTransport();
			sendJson(res, 200, { ok: true });
			return;
		}

		if (req.method === "POST" && path === "/pair/cancel") {
			if (snap.state !== "pairing") {
				sendJson(res, 409, { error: "not pairing" });
				return;
			}
			await options.transport.stop();
			sendJson(res, 200, { ok: true });
			return;
		}

		if (req.method === "POST" && path === "/verify") {
			if (snap.state !== "connected") {
				sendJson(res, 409, { error: "channel is not connected" });
				return;
			}
			const results: Array<{ masked: string | null; ok: boolean }> = [];
			for (const number of options.allowlist) {
				let ok = true;
				try {
					await options.transport.sendText(number, VERIFY_TEXT);
				} catch (error) {
					ok = false;
					log(`verify send failed (…${number.slice(-4)}): ${(error as Error).message}`);
				}
				results.push({ masked: maskNumber(number), ok });
			}
			sendJson(res, 200, { results });
			return;
		}

		if (req.method === "POST" && path === "/unpair") {
			await options.unpair();
			sendJson(res, 200, { ok: true });
			return;
		}

		sendJson(res, 404, { error: "not found" });
	};

	return {
		async start() {
			mkdirSync(dirname(options.tokenFile), { recursive: true, mode: 0o700 });
			if (!statSyncSafe(options.tokenFile)) {
				writeFileSync(options.tokenFile, `${randomBytes(32).toString("base64url")}\n`, { mode: 0o600 });
			}
			chmodSync(options.tokenFile, 0o600);
			server = createServer((req, res) => {
				void handle(req, res).catch((error: unknown) => {
					log(`admin request failed: ${(error as Error)?.message ?? String(error)}`);
					if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
					else res.end();
				});
			});
			await new Promise<void>((resolve, reject) => {
				server?.once("error", reject);
				server?.listen(options.port, "127.0.0.1", () => resolve());
			});
			log(`admin API listening on 127.0.0.1:${(server?.address() as { port: number }).port}`);
		},
		async stop() {
			if (!server) return;
			await new Promise<void>((resolve) => {
				server?.close(() => resolve());
				server?.closeIdleConnections();
			});
			server = undefined;
		},
		port() {
			return (server?.address() as { port: number }).port;
		},
	};
}

function statSyncSafe(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Default unpair action wired in main.ts: stop the transport, clear the Baileys
 * auth dir (700) and reset the tracker. The server-side device link is dropped by
 * WhatsApp when the credentials stop refreshing; a fresh QR pairs from zero.
 */
export function createUnpairAction(options: {
	authDir: string;
	transport: ChannelTransport;
	tracker: ReturnType<typeof createChannelStateTracker>;
	log?(message: string): void;
}): () => Promise<void> {
	const log = options.log ?? (() => {});
	return async () => {
		try {
			await options.transport.stop();
		} catch (error) {
			log(`unpair stop failed: ${(error as Error).message}`);
		}
		rmSync(options.authDir, { recursive: true, force: true });
		options.tracker.reset();
		log("unpaired: auth dir cleared; scan a new QR to link again");
	};
}
