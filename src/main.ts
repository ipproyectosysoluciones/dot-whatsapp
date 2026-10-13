import { homedir } from "node:os";
import { Bridge } from "./bridge.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { DaemonClient } from "./daemon-client.ts";
import { createEngramStore } from "./engram-store.ts";
import { createBaileysTransport } from "./whatsapp.ts";

const log = (message: string) => console.error(`[dot-whatsapp] ${message}`);

async function main(): Promise<void> {
	let config: ReturnType<typeof loadConfig>;
	try {
		config = loadConfig(process.env, homedir());
	} catch (error) {
		if (!(error instanceof ConfigError)) throw error;
		log(error.message);
		process.exit(1);
	}

	process.on("unhandledRejection", (error) =>
		log(`unexpected error: ${(error as Error)?.message ?? String(error)}`),
	);

	// The bridge DB: idempotency + liveness notes live in Engram. Fails closed if the CLI is absent.
	const store = createEngramStore({ project: config.engramProject, log });
	try {
		await store.remember(
			"boot",
			"dot-whatsapp bridge started",
			"**What**: bridge process booted (allowlist armed, daemon client connecting).",
		);
	} catch (error) {
		log(`Engram is unreachable; refusing to relay without idempotency: ${(error as Error).message}`);
		process.exit(1);
	}

	const transport = createBaileysTransport({
		authDir: config.authDir,
		allowedNumbers: config.allowedNumbers,
		log,
	});
	let bridge: Bridge;
	const daemon = new DaemonClient({
		url: config.daemonUrl,
		tokenFile: config.tokenFile,
		log,
		onMessage: (message) => void bridge?.handleDaemon(message),
		onConnection: (connected) => {
			log(connected ? "connected to Gentle Dot" : "disconnected from Gentle Dot, retrying");
			if (!connected) void bridge?.connectionLost();
		},
		onFatal: (reason) => {
			log(reason);
			void transport.stop().finally(() => process.exit(1));
		},
	});
	bridge = new Bridge({ transport, daemon, store, allowedNumbers: config.allowedNumbers, log });
	transport.onMessage((message) => void bridge.onInbound(message));

	const shutdown = () => {
		daemon.stop();
		void transport.stop().finally(() => process.exit(0));
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	daemon.start();
	await transport.start();
	log(`listening; ${config.allowedNumbers.size} allowlisted number(s), auth dir: ${config.authDir}`);
}

void main();
