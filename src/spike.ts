/**
 * Spike T4: Baileys raw, QR pairing once, echo ONLY in the account's own
 * "Message yourself" chat (no third-party numbers touched, nothing allowlisted
 * beyond the linked account itself). Proves QR → connect → receive → send.
 */
import { mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import qrcode from "qrcode-terminal";
import makeWASocket, {
	DisconnectReason,
	isJidUser,
	isLidUser,
	type WASocket,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { pino } from "pino";

const AUTH_DIR = process.env.DOT_WHATSAPP_AUTH_DIR?.trim() || join(homedir(), ".dot-whatsapp", "auth");
mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
chmodSync(AUTH_DIR, 0o700);

const logger = pino({ level: process.env.DOT_WHATSAPP_LOG_LEVEL ?? "warn" });
const log = (m: string) => console.error(`[spike] ${m}`);

async function run(): Promise<void> {
	const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
	const sock: WASocket = makeWASocket({
		auth: state,
		logger,
		printQRInTerminal: false,
		browser: ["dot-whatsapp", "spike", "0.0.0"],
	});
	sock.ev.on("creds.update", () => void saveCreds());

	let ownLid: string | undefined;

	sock.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect, qr } = update;
		if (qr) {
			log("escaneá este QR con WhatsApp → Dispositivos vinculados (del número del BOT):");
			qrcode.generate(qr, { small: true });
		}
		if (connection === "open") log("connected to WhatsApp (session open)");
		if (connection === "close") {
			const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
				?.statusCode;
			if (code === DisconnectReason.loggedOut) {
				log("logged out: delete the auth dir and pair again");
				process.exit(1);
			}
			log(`connection closed (code ${String(code)}), reconnecting`);
			void run();
		}
	});

	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify") return;
		for (const message of messages) {
			if (!message.key.remoteJid || message.key.remoteJid === "status@broadcast") continue;
			const text =
				message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? undefined;
			if (!text) continue;
			// Test mode: echo any direct 1:1 text (fromMe=false). Baileys' own helpers define
			// "direct": @s.whatsapp.net users and @lid users; groups/newsletters/status/bots are out.
			const remote = message.key.remoteJid;
			if (!(isJidUser(remote) || isLidUser(remote))) continue;
			if (message.key.fromMe) continue; // anti-loop: our own sends (incl. self-chat)
			if (text.startsWith("🔄 eco dot-whatsapp:")) continue;
			log(`inbound from=${remote.replace(/@.+$/, "")} (@${remote.split("@")[1]}) text=${JSON.stringify(text.slice(0, 80))}`);
			const reply = `🔄 eco dot-whatsapp: ${text}`;
			await sock.sendMessage(remote, { text: reply });
			log(`echoed msg-${message.key.id ?? "no-id"} (${reply.length} chars)`);
		}
	});
}

await run();
log(`listening; auth dir (700): ${AUTH_DIR}`);
