/**
 * The WhatsApp side of the bridge: Baileys raw (no builderbot wrapper), the default
 * `ChannelTransport` implementation. QR/pairing once, credentials under `authDir` (0700),
 * inbound messages filtered by the allowlist and pushed to the bridge, outbound text
 * sent via sendText. Reconnects follow Baileys' own signal + our backoff.
 *
 * Scope guard (study doc §6): phase 1 is plain text, DMs only, no groups, no media.
 */
// import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

export interface ChannelInbound {
	/** E.164 digits of the sender. */
	from: string;
	/** The provider's unique message id (the bridge's idempotency anchor). */
	id: string;
	text: string;
}

export interface ChannelTransport {
	/** Starts the provider (QR pairing on first run) and resolves when listening. */
	start(): Promise<void>;
	/** Register the inbound handler for allowlisted direct texts (anti-loop already applied). */
	onMessage(handler: (message: ChannelInbound) => void): void;
	/** Sends plain text; throws when the socket is down (the bridge retries via daemon backoff). */
	sendText(toNumber: string, text: string): Promise<void>;
	/** Stops the socket; process exit is owned by main.ts. */
	stop(): Promise<void>;
}

import { mkdirSync, chmodSync } from "node:fs";
import { isJidUser, isLidUser, DisconnectReason } from "@whiskeysockets/baileys";
import QRCode from "qrcode";

/** Creates the Baileys-backed transport (lazy import: boot cost stays out of unit-test paths). */
export function createBaileysTransport(options: {
	authDir: string;
	allowedNumbers: Set<string>;
	log?(m: string): void;
}): ChannelTransport {
	const log = options.log ?? (() => {});
	let handler: ((message: ChannelInbound) => void) | undefined;
	let sockReady: { sendMessage(jid: string, content: { text: string }): Promise<unknown> } | undefined;
	let socket: { end(error?: Error): void } | undefined;
	let reconnect: (() => void) | undefined;
	/** Real inbound JID per user portion (WhatsApp may route as @lid, not @s.whatsapp.net). */
	const jids = new Map<string, string>();

	return {
		onMessage(h) {
			handler = h;
		},
		async start() {
			mkdirSync(options.authDir, { recursive: true, mode: 0o700 });
			chmodSync(options.authDir, 0o700);
			const baileys = await import("@whiskeysockets/baileys");
			const { pino } = await import("pino");
			const boot = async (): Promise<void> => {
				reconnect = () => void boot();
				const { state, saveCreds } = await baileys.useMultiFileAuthState(options.authDir);
				const ws = baileys.default({
					auth: state,
					logger: pino({ level: "warn" }),
					browser: ["dot-whatsapp", "bridge", "0.1.0"],
				});
				socket = ws;
				ws.ev.on("creds.update", () => void saveCreds());
				ws.ev.on("connection.update", async (update) => {
					if (update.qr) {
						const qr = await QRCode.toString(update.qr, {
							type: "terminal",
							small: true,
							errorCorrectionLevel: "L",
						});
						log(qr);
						const pngPath = options.authDir + "/../qr.png";
						await QRCode.toFile(pngPath, update.qr, {
							errorCorrectionLevel: "L",
							width: 600,
							margin: 4,
						});
						log("QR code rendered — scan with WhatsApp Business → Linked Devices → Link a Device");
						log(`QR image saved to ${pngPath} — open in browser/image viewer to scan`);
					}
					if (update.connection === "open") {
						sockReady = ws;
						log("WhatsApp session open");
					}
					if (update.connection === "close") {
						sockReady = undefined;
						const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
						if (code === DisconnectReason.loggedOut) {
							log("logged out: delete the auth dir and pair again");
							return;
						}
						log(`connection closed (code ${String(code)}), reconnecting`);
						reconnect?.();
					}
				});
				ws.ev.on("messages.upsert", ({ messages, type }) => {
					if (type !== "notify" || !handler) return;
					for (const m of messages) {
						const remote = m.key.remoteJid;
						if (!remote || !(isJidUser(remote) || isLidUser(remote))) continue;
						if (m.key.fromMe) continue; // anti-loop
						const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text;
						if (!text || !m.key.id) continue;
						const from = remote.split("@")[0];
						if (!options.allowedNumbers.has(from)) {
							log(`ignored: not allowlisted (…${from.slice(-4)})`);
							continue;
						}
						jids.set(from, remote);
						handler({ from, id: m.key.id, text });
					}
				});
			};
			await boot();
		},
		async sendText(toNumber, text) {
			if (!sockReady) throw new Error("WhatsApp is not connected");
			await sockReady.sendMessage(jids.get(toNumber) ?? `${toNumber}@s.whatsapp.net`, { text });
		},
		async stop() {
			reconnect = undefined;
			socket?.end(undefined);
			sockReady = undefined;
		},
	};
}
