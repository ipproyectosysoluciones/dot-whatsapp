import {
	type AgentState,
	type Ask,
	type ClientMessage,
	type ServerMessage,
} from "./protocol.ts";
import type { EngramLike } from "./engram-store.ts";
import type { ChannelTransport } from "./whatsapp.ts";
import { RateLimiter } from "./rate-limit.ts";

/** WhatsApp's practical text message ceiling; we stay well under it. */
export const WHATSAPP_TEXT_LIMIT = 4000;

/** Every message relayed to the daemon is tagged so the assistant knows its origin. */
const SOURCE_LABEL = "📱 [dot-whatsapp] ";

/** Daemon errors that refuse a `send`; others leave the turn open. */
const SEND_REFUSALS = new Set(["no_account", "agent_unavailable", "command_failed", "unsupported"]);

const BUSY_STATES: AgentState[] = ["thinking", "working", "needs_you"];

const UNREACHABLE =
	"Gentle Dot no responde en este momento. ¿Está corriendo? Probá de nuevo en un rato.";

/** Split text into chunks of at most `limit` chars, preferring a line break near the cut. */
export function splitMessage(text: string, limit = WHATSAPP_TEXT_LIMIT): string[] {
	const chunks: string[] = [];
	let rest = text;
	while (rest.length > limit) {
		const breakAt = rest.lastIndexOf("\n", limit);
		const cut = breakAt > limit / 2 ? breakAt : limit;
		chunks.push(rest.slice(0, cut));
		rest = rest.slice(cut).replace(/^\n/, "");
	}
	if (rest !== "") chunks.push(rest);
	return chunks;
}

export interface DaemonConnection {
	/** False when the message could not be sent (no connection). */
	send(message: ClientMessage): boolean;
}

export interface InboundMessage {
	/** E.164 digits of the sender. */
	from: string;
	/** The provider's unique message id (idempotency anchor). */
	id: string;
	text: string;
}

interface Turn {
	buffer: string;
	requestId: string;
}

interface PendingAsk {
	ask: Ask;
	from: string;
}

export interface BridgeOptions {
	transport: ChannelTransport;
	daemon: DaemonConnection;
	store: EngramLike;
	allowedNumbers: Set<string>;
	sourceLabel?: string;
	log(message: string): void;
	rateLimiter?: RateLimiter;
}

/**
 * Relays allowlisted WhatsApp DMs to the Gentle Dot daemon and back.
 * Text-only, no groups; asks are answered by number or text.
 */
export class Bridge {
	private readonly options: BridgeOptions;
	private turn: Turn | undefined;
	private ask: PendingAsk | undefined;
	private agentState: AgentState = "idle";
	private readonly sourceLabel: string;
	private readonly rateLimiter: RateLimiter;

	constructor(options: BridgeOptions) {
		this.options = options;
		this.sourceLabel = options.sourceLabel ?? SOURCE_LABEL;
		this.rateLimiter = options.rateLimiter ?? new RateLimiter(options.transport, options.log);
		// The transport delivers fully-filtered messages through onInbound; see main.ts.
	}

	// The transport reports fully-filtered messages through onInbound; nothing else is needed.

	/** One inbound message from the transport layer, with its provider id. */
	async onInbound(message: InboundMessage): Promise<void> {
		const { from, id, text } = message;
		if (!this.options.allowedNumbers.has(from)) {
			this.options.log(`ignored: number not allowlisted (…${from.slice(-4)})`);
			return;
		}
		this.lastFrom = from;
		const trimmed = text.trim();
		if (trimmed === "") return;
		// Idempotency: Engram topic_key msg-<id> — a restart never replays nor double-replies.
		const key = `msg-${id}`;
		if (await this.options.store.seen(key)) {
			this.options.log(`ignored: duplicate ${key}`);
			return;
		}
		await this.options.store.remember(
			key,
			`dot-whatsapp inbound ${key}`,
			`**What**: inbound WhatsApp message relayed to the daemon.\n**From (hashed tail)**: …${from.slice(-4)}\n**Text length**: ${trimmed.length} chars`,
		);
		if (trimmed === "/stop") {
			await this.stop(from);
			return;
		}
		if (this.ask) {
			const answered = this.answerAsk(this.ask, trimmed);
			if (answered) {
				this.ask = undefined;
				return;
			}
		}
		if (BUSY_STATES.includes(this.agentState)) {
			await this.reply(from, "Sigo trabajando en lo anterior; si querés frenar, mandá /stop.");
			return;
		}
		const ok = this.options.daemon.send({ type: "send", text: `${this.sourceLabel}${trimmed}` });
		if (!ok) await this.reply(from, UNREACHABLE);
	}

	async handleDaemon(message: ServerMessage): Promise<void> {
		try {
			await this.dispatch(message);
		} catch (error) {
			this.options.log(`daemon message failed: ${(error as Error)?.message ?? String(error)}`);
		}
	}

	private async dispatch(message: ServerMessage): Promise<void> {
		switch (message.type) {
			case "ready":
				this.agentState = message.agentState;
				return;
			case "agent_state":
				this.agentState = message.state;
				return;
			case "message_delta":
				if (this.turn && message.messageId) this.turn.buffer += message.delta;
				return;
			case "message_done": {
				const text = message.text ?? this.turn?.buffer ?? "";
				this.turn = undefined;
				if (text.trim() !== "") await this.replyBroadcast(text);
				return;
			}
			case "ask":
				await this.showAsk(message.ask);
				return;
			case "ask_resolved":
				if (this.ask?.ask.requestId === message.requestId) this.ask = undefined;
				return;
			case "error":
				if (SEND_REFUSALS.has(message.code)) {
					this.turn = undefined;
					await this.replyBroadcast(`No pude llegar al asistente: ${message.message}`);
				}
				return;
			case "channel_notify": {
				const to = message.to;
				const text = message.text;
				if (!to || !text) {
					this.options.log("channel_notify ignored: missing to or text");
					return;
				}
				if (!this.options.allowedNumbers.has(to)) {
					this.options.log(`channel_notify ignored: number not allowlisted (…${to.slice(-4)})`);
					return;
				}
				// Idempotency: if daemon provides requestId, use it as dedup anchor
				if (message.requestId) {
					const key = `msg-${message.requestId}`;
					if (await this.options.store.seen(key)) {
						this.options.log(`channel_notify ignored: duplicate ${key}`);
						return;
					}
					await this.options.store.remember(
						key,
						`dot-whatsapp proactive ${key}`,
						`**What**: proactive notification sent to allowlisted number.\n**To (hashed tail)**: …${to.slice(-4)}\n**Text length**: ${text.length} chars`,
					);
				}
				await this.reply(to, text);
				return;
			}
			default:
				return; // activity, toast, voice… — ignored by design in phase 1
		}
	}

	async connectionLost(): Promise<void> {
		this.turn = undefined;
		this.agentState = "idle";
	}

	private answerAsk(pending: PendingAsk, text: string): boolean {
		const { ask } = pending;
		const msg: ClientMessage = { type: "ui_response", requestId: ask.requestId };
		if (ask.method === "confirm") {
			const yes = /^(si|sí|s|y|yes|ok|dale|1)$/i.test(text);
			const no = /^(no|n|2)$/i.test(text);
			if (!yes && !no) return false;
			msg.confirmed = yes;
			msg.value = yes ? "confirm" : "cancel";
		} else if (ask.method === "select" && ask.options) {
			const byNumber = /^\d+$/.test(text) ? ask.options[Number(text) - 1] : undefined;
			const byText = ask.options.find((o) => o.toLowerCase() === text.toLowerCase());
			const choice = byNumber ?? byText;
			if (!choice) return false;
			msg.value = choice;
		} else if (ask.method === "input") {
			msg.value = text;
		} else {
			return false; // editor/app/pin live in the desktop app
		}
		this.options.daemon.send(msg);
		return true;
	}

	private async showAsk(ask: Ask): Promise<void> {
		const to = this.lastFrom ?? "";
		this.ask = { ask, from: to };
		const lines = [`✋ El asistente pregunta: *${ask.title}*`];
		if (ask.message) lines.push(ask.message);
		if (ask.method === "select" && ask.options)
			ask.options.forEach((option, i) => lines.push(`${i + 1}. ${option}`));
		if (ask.method === "confirm") lines.push("Respondé 1= sí, 2= no.");
		else if (ask.method === "select") lines.push("Respondé con el número o el texto.");
		else if (ask.method === "input") lines.push("Respondé con el texto pedido.");
		else lines.push("Esta acción se responde en la app de escritorio.");
		if (to) await this.reply(to, lines.join("\n"));
	}

	private async stop(from: string): Promise<void> {
		const ok = this.options.daemon.send({ type: "abort" });
		this.turn = undefined;
		await this.reply(from, ok ? "🛑 Detenido." : UNREACHABLE);
	}

	/** The assistant's answer goes to whoever is talking to it right now; phase 1: last asker. */
	private lastFrom: string | undefined;

	private async replyBroadcast(text: string): Promise<void> {
		if (!this.lastFrom) return;
		await this.reply(this.lastFrom, text);
	}

	private async reply(to: string, text: string): Promise<void> {
		try {
			await this.rateLimiter.send(to, text);
		} catch (error) {
			this.options.log(`rate limit send failed: ${(error as Error)?.message ?? String(error)}`);
		}
	}
}