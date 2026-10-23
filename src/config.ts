import { join } from "node:path";

export interface Config {
	/** Where Baileys keeps its own credential files (must be mode 700). Never in Engram. */
	authDir: string;
	/** E.164 numbers (digits only) allowed to talk to the assistant. */
	allowedNumbers: Set<string>;
	/** The daemon's WebSocket address. */
	daemonUrl: string;
	/** File holding the daemon's access key. */
	tokenFile: string;
	/** Engram endpoint used as the bridge DB (idempotency, allowlist override, state). */
	engramUrl: string;
	/** Engram project receiving this bridge's operational observations. */
	engramProject: string;
	/** WhatsApp provider to use: "baileys" (default) or "meta-cloud". */
	provider: "baileys" | "meta-cloud";
	/** Local admin API port (Channels panel); the server always binds 127.0.0.1. */
	adminPort: number;
	/** File holding the admin API bearer token (0600, created if absent). */
	adminTokenFile: string;
}

/** A configuration problem; the message names the variable and never repeats its value. */
export class ConfigError extends Error {}

const NUMBER = /^[1-9][0-9]{6,14}$/;

/** True for a valid E.164 number in digits-only form (no leading +). */
export function isValidE164(value: string): boolean {
	return NUMBER.test(value);
}

export function loadConfig(env: Record<string, string | undefined>, home: string): Config {
	const numbers = (env.DOT_WHATSAPP_ALLOWED_NUMBERS ?? "")
		.split(",")
		.map((n) => n.trim().replace(/^\+/, ""))
		.filter((n) => n !== "");
	if (numbers.length === 0 || !numbers.every((n) => NUMBER.test(n))) {
		throw new ConfigError(
			"DOT_WHATSAPP_ALLOWED_NUMBERS must list at least one E.164 number, digits only, separated by commas.",
		);
	}

	const daemonUrl = env.GENTLE_DOT_URL?.trim() || "ws://127.0.0.1:4317/ws";
	if (!/^wss?:\/\//.test(daemonUrl)) throw new ConfigError("GENTLE_DOT_URL must start with ws:// or wss://.");

	const adminPortRaw = env.DOT_WHATSAPP_ADMIN_PORT?.trim() || "4407";
	const adminPort = Number(adminPortRaw);
	if (!Number.isInteger(adminPort) || adminPort < 1 || adminPort > 65535) {
		throw new ConfigError("DOT_WHATSAPP_ADMIN_PORT must be an integer between 1 and 65535.");
	}

	return {
		authDir: env.DOT_WHATSAPP_AUTH_DIR?.trim() || join(home, ".dot-whatsapp", "auth"),
		allowedNumbers: new Set(numbers),
		daemonUrl,
		tokenFile: env.GENTLE_DOT_TOKEN_FILE?.trim() || join(home, ".gentle-dot", "token"),
		engramUrl: env.ENGRAM_URL?.trim() || "http://127.0.0.1:47821",
		engramProject: env.DOT_WHATSAPP_ENGRAM_PROJECT?.trim() || "dot-whatsapp",
		provider: (env.DOT_WHATSAPP_PROVIDER ?? "baileys") as "baileys" | "meta-cloud",
		adminPort,
		adminTokenFile: env.DOT_WHATSAPP_ADMIN_TOKEN_FILE?.trim() || join(home, ".dot-whatsapp", "admin-token"),
	};
}
