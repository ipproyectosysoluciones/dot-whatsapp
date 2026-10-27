// The real Meta Cloud API transport (T10, S8): a webhook receiver (GET
// verification handshake, POST with X-Hub-Signature-256 validation) plus
// Graph API sends. Everything runs offline against loopback fakes — the
// live Meta verification needs the owner's Meta Business setup (external
// dependency, documented as the slice's remaining exit criterion).
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.ts";
import { createMetaCloudTransport, type MetaCloudConfig } from "../src/meta-cloud-transport.ts";

const APP_SECRET = "test-app-secret-0123456789abcdef";
const VERIFY_TOKEN = "test-verify-token";
const GRAPH_TOKEN = "graph-token-0123456789abcdef";
const PHONE_ID = "123456789012345";
const ALLOWED = "5491112345678";

const metaConfig = (overrides: Partial<MetaCloudConfig> = {}): MetaCloudConfig => ({
	phoneNumberId: PHONE_ID,
	token: GRAPH_TOKEN,
	verifyToken: VERIFY_TOKEN,
	appSecret: APP_SECRET,
	webhookPort: 0,
	webhookHost: "127.0.0.1",
	graphUrl: "http://127.0.0.1:1", // replaced per-test with the fake graph port
	graphVersion: "v21.0",
	...overrides,
});

/** A fake Graph API: records the last request, answers with a chosen status. */
let graphRequests: Array<{ path: string; auth: string | undefined; body: unknown }> = [];
let graphStatus = 200;
let graph: Server | undefined;
let graphPort = 0;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	graph = undefined;
	graphRequests = [];
});

async function startFakeGraph(): Promise<number> {
	graph = createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
		req.on("end", () => {
			graphRequests.push({ path: req.url ?? "", auth: req.headers.authorization, body: raw === "" ? undefined : JSON.parse(raw) });
			res.writeHead(graphStatus, { "content-type": "application/json" });
			res.end(JSON.stringify(graphStatus === 200 ? { messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" }] } : { error: { message: "boom" } }));
		});
	});
	const listening = graph;
	if (!listening) return 0;
	await new Promise<void>((done) => listening.listen(0, "127.0.0.1", done));
	graphPort = (listening.address() as AddressInfo).port;
	return graphPort;
}

function sign(body: string): string {
	return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

function webhookPayload(from: string, id: string, text: string, type = "text"): string {
	return JSON.stringify({
		object: "whatsapp_business_account",
		entry: [
			{
				id: "entry-1",
				changes: [
					{
						field: "messages",
						value: {
							messaging_product: "whatsapp",
							metadata: { display_phone_number: "549999", phone_number_id: PHONE_ID },
							contacts: [{ profile: { name: "tester" }, wa_id: from }],
							messages: [{ from, id, timestamp: "1700000000", type, ...(type === "text" ? { text: { body: text } } : {}) }],
						},
					},
				],
			},
		],
	});
}

function postWebhook(port: number, body: string, signature?: string): Promise<{ status: number }> {
	return new Promise((resolve, reject) => {
		const req = fetch(`http://127.0.0.1:${port}/webhook`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(signature ? { "x-hub-signature-256": signature } : {}),
			},
			body,
		}).then((res) => {
			void res.arrayBuffer();
			resolve({ status: res.status });
		}, reject);
		void req;
	});
}

describe("meta-cloud config (fail closed)", () => {
	it("requires the four Meta variables when the provider is meta-cloud", () => {
		try {
			loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: ALLOWED, DOT_WHATSAPP_PROVIDER: "meta-cloud" }, "/home/x");
			expect.unreachable("must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			const message = (error as Error).message;
			expect(message).toContain("DOT_WHATSAPP_META_PHONE_NUMBER_ID");
			expect(message).toContain("DOT_WHATSAPP_META_TOKEN");
			expect(message).toContain("DOT_WHATSAPP_META_VERIFY_TOKEN");
			expect(message).toContain("DOT_WHATSAPP_META_APP_SECRET");
		}
	});

	it("builds the meta block with defaults when the provider is meta-cloud", () => {
		const config = loadConfig(
			{
				DOT_WHATSAPP_ALLOWED_NUMBERS: ALLOWED,
				DOT_WHATSAPP_PROVIDER: "meta-cloud",
				DOT_WHATSAPP_META_PHONE_NUMBER_ID: PHONE_ID,
				DOT_WHATSAPP_META_TOKEN: GRAPH_TOKEN,
				DOT_WHATSAPP_META_VERIFY_TOKEN: VERIFY_TOKEN,
				DOT_WHATSAPP_META_APP_SECRET: APP_SECRET,
			},
			"/home/x",
		);
		expect(config.meta).toEqual({
			phoneNumberId: PHONE_ID,
			token: GRAPH_TOKEN,
			verifyToken: VERIFY_TOKEN,
			appSecret: APP_SECRET,
			webhookPort: 4408,
			webhookHost: "0.0.0.0",
			graphUrl: "https://graph.facebook.com",
			graphVersion: "v21.0",
		});
	});

	it("leaves meta null for the baileys provider", () => {
		const config = loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: ALLOWED }, "/home/x");
		expect(config.meta).toBeNull();
	});
});

describe("meta-cloud transport — webhook", () => {
	it("answers the GET verification handshake with the challenge, refusing wrong tokens", async () => {
		const port = await startFakeGraph();
		let listeningPort = 0;
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({
				webhookPort: 0,
				webhookHost: "127.0.0.1",
				graphUrl: `http://127.0.0.1:${port}`,
				onListening: (p) => (listeningPort = p),
			}),
		});
		cleanups.push(() => transport.stop());
		await transport.start();
		expect(listeningPort).toBeGreaterThan(0);

		const ok = await fetch(`http://127.0.0.1:${listeningPort}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHALLENGE123`);
		expect(ok.status).toBe(200);
		expect(await ok.text()).toBe("CHALLENGE123");

		const bad = await fetch(`http://127.0.0.1:${listeningPort}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X`);
		expect(bad.status).toBe(403);
	});

	it("validates X-Hub-Signature-256 before delivering inbound messages", async () => {
		const port = await startFakeGraph();
		let listeningPort = 0;
		const inbound: Array<{ from: string; id: string; text: string }> = [];
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${port}`, onListening: (p) => (listeningPort = p) }),
		});
		cleanups.push(() => transport.stop());
		transport.onMessage((m) => inbound.push(m));
		transport.onState?.(() => {});
		await transport.start();

		const body = webhookPayload(ALLOWED, "wamid.IN1", "hola dot");
		const missing = await postWebhook(listeningPort, body);
		expect(missing.status).toBe(401);
		const bad = await postWebhook(listeningPort, body, "sha256=deadbeef");
		expect(bad.status).toBe(401);
		const good = await postWebhook(listeningPort, body, sign(body));
		expect(good.status).toBe(200);

		// The signature check answers before processing; give the handler a tick.
		await new Promise((r) => setTimeout(r, 50));
		expect(inbound).toEqual([{ from: ALLOWED, id: "wamid.IN1", text: "hola dot" }]);
	});

	it("filters non-allowlisted senders and ignores non-text messages", async () => {
		const port = await startFakeGraph();
		let listeningPort = 0;
		const inbound: Array<{ from: string; id: string; text: string }> = [];
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${port}`, onListening: (p) => (listeningPort = p) }),
		});
		cleanups.push(() => transport.stop());
		transport.onMessage((m) => inbound.push(m));
		await transport.start();

		const stranger = await postWebhook(listeningPort, webhookPayload("5499999999999", "wamid.S1", "spam"), sign(webhookPayload("5499999999999", "wamid.S1", "spam")));
		expect(stranger.status).toBe(200);
		const media = await postWebhook(listeningPort, webhookPayload(ALLOWED, "wamid.M1", "", "image"), sign(webhookPayload(ALLOWED, "wamid.M1", "", "image")));
		expect(media.status).toBe(200);
		await new Promise((r) => setTimeout(r, 50));
		expect(inbound).toEqual([]);
	});
});

describe("meta-cloud transport — Graph sends", () => {
	it("sends text via Graph with the configured version, phone id, token, and payload", async () => {
		const port = await startFakeGraph();
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${port}` }),
		});
		cleanups.push(() => transport.stop());
		await transport.start();

		await expect(transport.sendText(ALLOWED, "👋 dot-whatsapp vinculado")).resolves.toBeUndefined();
		expect(graphRequests).toHaveLength(1);
		expect(graphRequests[0]?.path).toBe(`/${"v21.0"}/${PHONE_ID}/messages`);
		expect(graphRequests[0]?.auth).toBe(`Bearer ${GRAPH_TOKEN}`);
		expect(graphRequests[0]?.body).toEqual({
			messaging_product: "whatsapp",
			to: ALLOWED,
			type: "text",
			text: { body: "👋 dot-whatsapp vinculado" },
		});
	});

	it("throws with the Graph status when the send is refused", async () => {
		await startFakeGraph();
		graphStatus = 500;
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${graphPort}` }),
		});
		cleanups.push(() => transport.stop());
		await transport.start();
		await expect(transport.sendText(ALLOWED, "hola")).rejects.toThrow(/500/);
	});
});

describe("meta-cloud transport — lifecycle", () => {
	it("emits open after start and close(stopped) after stop, releasing the port", async () => {
		await startFakeGraph();
		const events: Array<{ kind: string; reason?: string }> = [];
		const transport = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${graphPort}` }),
		});
		cleanups.push(() => transport.stop());
		transport.onState?.((e) => events.push(e));
		await transport.start();
		expect(events.some((e) => e.kind === "open")).toBe(true);
		await transport.stop();
		expect(events.some((e) => e.kind === "close" && e.reason === "stopped")).toBe(true);
		// The webhook port is released: a second transport can bind the same port.
		const again = createMetaCloudTransport({
			allowedNumbers: new Set([ALLOWED]),
			meta: metaConfig({ graphUrl: `http://127.0.0.1:${graphPort}` }),
		});
		cleanups.push(() => again.stop());
		await expect(again.start()).resolves.toBeUndefined();
	});
});
