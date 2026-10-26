import { homedir } from "node:os";
import {
	createAdminApi,
	createChannelStateTracker,
	createUnpairAction,
	maskNumber,
} from "./admin-api.ts";
import { loadAllowlistFile, resolveAllowlist, saveAllowlistFile } from "./allowlist-store.ts";
import { Bridge } from "./bridge.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { DaemonClient } from "./daemon-client.ts";
import { createEngramStore } from "./engram-store.ts";
import { createTransportFactory } from "./transport-factory.ts";

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

	// Boot-restore (S7): the allowlist file is the source of truth once it exists;
	// the env only seeds the first boot. The shared Set is filled here, before
	// transport, bridge, and admin API take their references.
	const stored = loadAllowlistFile(config.allowlistFile);
	const resolved = resolveAllowlist([...config.allowedNumbers], stored);
	config.allowedNumbers.clear();
	for (const number of resolved.numbers) config.allowedNumbers.add(number);
	if (resolved.restored) {
		log(`allowlist restored from file: ${resolved.numbers.length} number(s)`);
	} else {
		saveAllowlistFile(config.allowlistFile, resolved.numbers);
		log(`allowlist seeded from env: ${resolved.numbers.length} number(s)`);
	}

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

	const transport = createTransportFactory({
		authDir: config.authDir,
		allowedNumbers: config.allowedNumbers,
		log,
		provider: config.provider,
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

	// Admin API (S6): the Channels panel drives pairing/allowlist/teardown through here.
	// The tracker mirrors transport state; the allowlist Set is shared, so mutations apply hot.
	const tracker = createChannelStateTracker({ provider: config.provider });
	transport.onState?.((event) => tracker.apply(event));
	const admin = createAdminApi({
		port: config.adminPort,
		provider: config.provider,
		tokenFile: config.adminTokenFile,
		transport,
		state: () => tracker.snapshot(),
		allowlist: config.allowedNumbers,
		unpair: createUnpairAction({ authDir: config.authDir, transport, tracker, log }),
		onAllowlistChange: (numbers) => {
			// The file is the source of truth (full digits, 0600); Engram keeps a masked note.
			try {
				saveAllowlistFile(config.allowlistFile, numbers);
			} catch (error: unknown) {
				log(`allowlist file persist failed: ${(error as Error).message}`);
			}
			void store
				.remember(
					"allowlist",
					"dot-whatsapp allowlist updated",
					`**What**: allowlist changed via the admin API (hot apply).\n**Numbers**: ${numbers.map((n) => maskNumber(n)).join(", ")}`,
				)
				.catch((error: unknown) => log(`allowlist persist failed: ${(error as Error).message}`));
		},
		log,
	});

	const shutdown = () => {
		void admin.stop().finally(() => {
			daemon.stop();
			void transport.stop().finally(() => process.exit(0));
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	daemon.start();
	await admin.start();
	await transport.start();
	log(`listening; ${config.allowedNumbers.size} allowlisted number(s), auth dir: ${config.authDir}`);
}

void main();
