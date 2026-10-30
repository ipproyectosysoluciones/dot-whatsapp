import { describe, expect, it } from "vitest";
import { Bridge, splitMessage, type BridgeOptions } from "../src/bridge.ts";
import type { EngramLike } from "../src/engram-store.ts";
import type { ChannelTransport } from "../src/whatsapp.ts";
import type { ClientMessage, ServerMessage } from "../src/protocol.ts";

const ALLOWED = "5491100001111";

function harness(overrides: Partial<BridgeOptions> = {}) {
	const sent: { to: string; text: string }[] = [];
	const daemon: { messages: ClientMessage[]; online: boolean } = { messages: [], online: true };
	const memory = new Set<string>();
	const logs: string[] = [];
	const store: EngramLike = {
		seen: async (k) => memory.has(k),
		remember: async (k) => void memory.add(k),
	};
	const transport: ChannelTransport = {
		start: async () => {},
		onMessage: () => {},
		sendText: async (to, text) => {
			sent.push({ to, text });
		},
		stop: async () => {},
	};
	const bridge = new Bridge({
		transport,
		daemon: {
			send: (m) => {
				if (!daemon.online) return false;
				daemon.messages.push(m);
				return true;
			},
		},
		store,
		allowedNumbers: new Set([ALLOWED]),
		log: (m) => logs.push(m),
		...overrides,
	});
	const inbound = (text: string, opts: { from?: string; id?: string } = {}) =>
		bridge.onInbound({ from: opts.from ?? ALLOWED, id: opts.id ?? `id-${Math.random()}`, text });
	return { bridge, sent, daemon, memory, logs, inbound };
}

describe("bridge: inbound safety", () => {
	it("relays allowlisted texts to the daemon with the source label", async () => {
		const { inbound, daemon, sent } = harness();
		await inbound("hola dot");
		expect(daemon.messages).toEqual([
			{ type: "send", text: expect.stringContaining("hola dot") },
		]);
		expect((daemon.messages[0] as { text: string }).text).toMatch(/^📱 \[dot-whatsapp\]/);
		expect(sent).toEqual([]);
	});

	it("ignores and logs non-allowlisted numbers without touching the daemon store", async () => {
		const { inbound, daemon, memory, logs } = harness();
		await inbound("hola", { from: "1100000099" });
		expect(daemon.messages).toEqual([]);
		expect(memory.size).toBe(0);
		expect(logs.join("\n")).toMatch(/not allowlisted/);
		expect(logs.join("\n")).not.toContain("1100000099"); // no full numbers in the log
	});

	it("is idempotent: the same provider id is never relayed twice", async () => {
		const { inbound, daemon } = harness();
		await inbound("hola", { id: "same" });
		await inbound("hola", { id: "same" });
		expect(daemon.messages).toHaveLength(1);
	});

	it("daemon offline → user gets the unreachable note, nothing is stored as relayable", async () => {
		const { inbound, daemon, sent } = harness();
		daemon.online = false;
		await inbound("hola");
		expect(sent.map((s) => s.text).join("\n")).toMatch(/no responde|no está disponible|unreachable|Is it running/i);
	});

	it("/stop aborts and confirms even while busy", async () => {
		const { bridge, inbound, daemon, sent } = harness();
		await bridge.handleDaemon({ type: "agent_state", state: "working", seq: 1 } as ServerMessage);
		await inbound("trabajá en esto");
		await inbound("/stop");
		expect(daemon.messages).toContainEqual({ type: "abort" });
		expect(sent.some((s) => /Detenido/.test(s.text))).toBe(true);
	});

	it("while the agent is busy, new texts are deflected instead of piled onto the daemon", async () => {
		const { bridge, inbound, daemon, sent } = harness();
		await inbound("uno"); // idle: this one goes through
		await bridge.handleDaemon({ type: "agent_state", state: "working", seq: 1 } as ServerMessage);
		await inbound("dos");
		expect(daemon.messages).toHaveLength(1);
		expect(sent.some((s) => /Sigo trabajando/.test(s.text))).toBe(true);
	});
});

describe("bridge: daemon → whatsapp", () => {
	it("answers the last asker with the finished message", async () => {
		const { bridge, inbound, sent } = harness();
		await inbound("contame algo");
		await bridge.handleDaemon({
			type: "message_done",
			messageId: "m1",
			text: "acá está la respuesta",
			seq: 1,
		} as ServerMessage);
		expect(sent).toEqual([{ to: ALLOWED, text: "acá está la respuesta" }]);
	});

	it("a confirm ask is answered by 1/2 and resolved asks stop capturing", async () => {
		const { bridge, inbound, daemon } = harness();
		await inbound("borrá todo");
		await bridge.handleDaemon({
			type: "ask",
			ask: { requestId: "r1", method: "confirm", title: "¿borro?" },
			seq: 2,
		} as ServerMessage);
		await inbound("2");
		expect(daemon.messages.at(-1)).toEqual({
			type: "ui_response",
			requestId: "r1",
			value: "cancel",
			confirmed: false,
		});
		await bridge.handleDaemon({ type: "ask_resolved", requestId: "r1", seq: 3 } as ServerMessage);
		await inbound("seguimos");
		expect(daemon.messages.at(-1)).toMatchObject({ type: "send" });
	});

	it("send refusals from the daemon surface to the user and close the turn", async () => {
		const { bridge, inbound, sent } = harness();
		await inbound("hola");
		await bridge.handleDaemon({ type: "error", code: "no_account", message: "no hay cuenta", seq: 1 } as ServerMessage);
		expect(sent.some((s) => /no hay cuenta/.test(s.text))).toBe(true);
	});
});

describe("splitMessage", () => {
	it("splits long texts under the limit, preferring line breaks", () => {
		const text = Array.from({ length: 30 }, (_, i) => `line ${i}\n`).join("");
		const chunks = splitMessage(text, 50);
		expect(chunks.every((c) => c.length <= 50)).toBe(true);
		expect(chunks.join("").replace(/\n{2}/, "\n")).toContain("line 0");
		expect(chunks.join("")).toContain("line 29");
	});
});

describe("bridge: proactive outreach (channel_notify)", () => {
	it("delivers proactive message to allowlisted number", async () => {
		const { bridge, sent } = harness();
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: "🔔 Recordatorio: backup programado",
			seq: 1,
		} as ServerMessage);
		expect(sent).toEqual([
			{ to: ALLOWED, text: "🔔 Recordatorio: backup programado" },
		]);
	});

	it("ignores channel_notify for non-allowlisted number", async () => {
		const { bridge, sent, logs } = harness();
		await bridge.handleDaemon({
			type: "channel_notify",
			to: "1100000099",
			text: "spam",
			seq: 1,
		} as ServerMessage);
		expect(sent).toEqual([]);
		expect(logs.join("\n")).toMatch(/not allowlisted/);
	});

	it("ignores channel_notify with missing to or text", async () => {
		const { bridge, sent, logs } = harness();
		await bridge.handleDaemon({ type: "channel_notify", to: "", text: "x", seq: 1 } as ServerMessage);
		await bridge.handleDaemon({ type: "channel_notify", to: ALLOWED, text: "", seq: 2 } as ServerMessage);
		await bridge.handleDaemon({ type: "channel_notify", to: "", text: "", seq: 3 } as ServerMessage);
		expect(sent).toEqual([]);
		expect(logs.join("\n")).toMatch(/missing to or text/);
	});

	it("idempotency: same requestId is never delivered twice", async () => {
		const { bridge, sent } = harness();
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: "primera",
			requestId: "req-123",
			seq: 1,
		} as ServerMessage);
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: "segunda",
			requestId: "req-123",
			seq: 2,
		} as ServerMessage);
		expect(sent).toHaveLength(1);
		expect(sent[0].text).toBe("primera");
	});

	it("without requestId, each channel_notify is delivered (no dedup anchor)", async () => {
		const { bridge, sent } = harness();
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: "uno",
			seq: 1,
		} as ServerMessage);
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: "dos",
			seq: 2,
		} as ServerMessage);
		expect(sent).toHaveLength(2);
		expect(sent.map((s) => s.text)).toEqual(["uno", "dos"]);
	});

	it("splits long proactive messages across chunks", async () => {
		const { bridge, sent } = harness();
		const longText = "A".repeat(5000);
		await bridge.handleDaemon({
			type: "channel_notify",
			to: ALLOWED,
			text: longText,
			seq: 1,
		} as ServerMessage);
		expect(sent.length).toBeGreaterThan(1);
		expect(sent.every((s) => s.text.length <= 4000)).toBe(true);
		expect(sent.map((s) => s.text).join("")).toBe(longText);
	});
});