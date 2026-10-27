/**
 * The real Meta WhatsApp Cloud API transport (T10): a webhook receiver for
 * inbound messages — GET verification handshake (hub.verify_token) and POST
 * with X-Hub-Signature-256 HMAC validation — plus Graph API sends
 * (`/{graphVersion}/{phoneNumberId}/messages`, bearer token). Phase 1 scope
 * guard (study §6): plain text, DMs only; media, groups, and templates are
 * ignored and logged.
 *
 * The webhook endpoint must be reachable by Meta (a public URL via reverse
 * proxy or tunnel is an external, owner-side dependency); every offline
 * behavior is pinned by loopback tests. The webhook answers 200 right after
 * signature validation and processes the payload afterwards, per Meta's
 * delivery requirements.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ChannelInbound, ChannelTransport, TransportStateEvent } from "./whatsapp.ts";

export interface MetaCloudConfig {
	phoneNumberId: string;
	token: string;
	verifyToken: string;
	appSecret: string;
	webhookPort: number;
	webhookHost: string;
	graphUrl: string;
	graphVersion: string;
	/** Test seam: the actual bound webhook port after start(). */
	onListening?: (port: number) => void;
}

export function createMetaCloudTransport(options: {
	authDir?: string;
	allowedNumbers: Set<string>;
	log?(m: string): void;
	meta?: MetaCloudConfig;
}): ChannelTransport {
	if (!options.meta) throw new Error("meta-cloud transport requires the meta configuration block");
	const meta = options.meta;
	const log = options.log ?? (() => {});
	let handler: ((message: ChannelInbound) => void) | undefined;
	let stateHandler: ((event: TransportStateEvent) => void) | undefined;
	let server: Server | undefined;

	const emit = (event: TransportStateEvent): void => stateHandler?.(event);

	const signatureValid = (rawBody: string, header: string | string[] | undefined): boolean => {
		const value = Array.isArray(header) ? header[0] : header;
		if (typeof value !== "string" || !value.startsWith("sha256=")) return false;
		const expected = createHmac("sha256", meta.appSecret).update(rawBody).digest();
		const given = Buffer.from(value.slice("sha256=".length), "hex");
		return given.length === expected.length && timingSafeEqual(given, expected);
	};

	const processPayload = (rawBody: string): void => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawBody);
		} catch {
			log("webhook payload is not JSON; ignored");
			return;
		}
		const entries = (parsed as { entry?: unknown })?.entry;
		if (!Array.isArray(entries)) return;
		for (const entry of entries) {
			const changes = (entry as { changes?: unknown })?.changes;
			if (!Array.isArray(changes)) continue;
			for (const change of changes) {
				const messages = (change as { value?: { messages?: unknown } })?.value?.messages;
				if (!Array.isArray(messages)) continue;
				for (const message of messages) {
					const m = message as { from?: unknown; id?: unknown; type?: unknown; text?: { body?: unknown } };
					const from = typeof m.from === "string" ? m.from : "";
					const id = typeof m.id === "string" ? m.id : "";
					const text = m.type === "text" && typeof m.text?.body === "string" ? m.text.body : "";
					if (!from || !id) continue;
					if (m.type !== "text" || !text) {
						log(`ignored ${String(m.type ?? "unknown")} message (text-only phase 1)`);
						continue;
					}
					if (!options.allowedNumbers.has(from)) {
						log(`ignored: not allowlisted (…${from.slice(-4)})`);
						continue;
					}
					handler?.({ from, id, text });
				}
			}
		}
	};

	const handleWebhook = (req: IncomingMessage, res: ServerResponse): void => {
		const url = new URL(req.url ?? "/", "http://localhost");
		if (req.method === "GET" && url.pathname === "/webhook") {
			if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === meta.verifyToken) {
				res.writeHead(200, { "content-type": "text/plain" });
				res.end(url.searchParams.get("hub.challenge") ?? "");
			} else {
				res.writeHead(403);
				res.end();
			}
			return;
		}
		if (req.method === "POST" && url.pathname === "/webhook") {
			let rawBody = "";
			req.on("data", (chunk: Buffer) => {
				rawBody += chunk.toString();
			});
			req.on("end", () => {
				if (!signatureValid(rawBody, req.headers["x-hub-signature-256"])) {
					log("webhook POST refused: missing or invalid X-Hub-Signature-256");
					res.writeHead(401);
					res.end();
					return;
				}
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				processPayload(rawBody);
			});
			return;
		}
		res.writeHead(404);
		res.end();
	};

	return {
		onMessage(h) {
			handler = h;
		},
		onState(h) {
			stateHandler = h;
		},
		async start() {
			server = createServer(handleWebhook);
			await new Promise<void>((resolve, reject) => {
				server?.once("error", reject);
				server?.listen(meta.webhookPort, meta.webhookHost, () => resolve());
			});
			const port = (server.address() as { port: number }).port;
			meta.onListening?.(port);
			log(`meta-cloud webhook listening on ${meta.webhookHost}:${port}`);
			emit({ kind: "open" });
		},
		async sendText(toNumber: string, text: string): Promise<void> {
			const url = `${meta.graphUrl}/${meta.graphVersion}/${meta.phoneNumberId}/messages`;
			const response = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${meta.token}` },
				body: JSON.stringify({ messaging_product: "whatsapp", to: toNumber, type: "text", text: { body: text } }),
				signal: AbortSignal.timeout(10_000),
			});
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				throw new Error(`graph send failed (${response.status}): ${detail.slice(0, 200)}`);
			}
		},
		async stop(): Promise<void> {
			if (!server) return;
			await new Promise<void>((resolve) => {
				server?.close(() => resolve());
				server?.closeIdleConnections();
			});
			server = undefined;
			emit({ kind: "close", reason: "stopped" });
		},
	};
}
