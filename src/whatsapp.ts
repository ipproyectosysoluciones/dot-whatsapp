/**
 * The WhatsApp side of the bridge: Baileys raw (no builderbot wrapper), the default
 * `ChannelTransport` implementation. QR/pairing once, credentials under `authDir` (0700),
 * inbound messages filtered by the allowlist and pushed to the bridge, outbound text
 * sent via sendText. Reconnects follow Baileys' own signal + our backoff.
 *
 * Scope guard (study doc §6): phase 1 is plain text, DMs only, no groups, no media.
 */
// import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";

export interface ChannelTransport {
	/** Starts the provider (QR pairing on first run) and resolves when listening. */
	start(): Promise<void>;
	/** Register the inbound handler; text is already trimmed, number is E.164 digits. */
	onMessage(handler: (fromNumber: string, text: string) => void): void;
	/** Sends plain text; throws when the socket is down (the bridge retries via daemon backoff). */
	sendText(toNumber: string, text: string): Promise<void>;
	/** Stops the socket; process exit is owned by main.ts. */
	stop(): Promise<void>;
}

/** TODO(T-spike): implement against @whiskeysockets/baileys once the dependency lands. */
export function createBaileysTransport(_options: { authDir: string; log?(m: string): void }): ChannelTransport {
	throw new Error("createBaileysTransport is not implemented yet (T-spike)");
}
