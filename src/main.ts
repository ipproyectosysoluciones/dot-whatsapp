import { homedir } from "node:os";
import { ConfigError, loadConfig } from "./config.ts";
import { DaemonClient } from "./daemon-client.ts";
import { createEngramStore } from "./engram-store.ts";

const log = (message: string) => console.error(`[dot-whatsapp] ${message}`);

function main(): void {
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

	// The bridge DB: idempotency + allowlist + liveness notes live in Engram.
	const store = createEngramStore({ url: config.engramUrl, project: config.engramProject, log });
	void store;

	// TODO(T-spike): const transport = createBaileysTransport({ authDir: config.authDir, log });
	// TODO(T-bridge): const bridge = new Bridge({ transport, daemon, store, allowedNumbers: config.allowedNumbers, log });
	const daemon = new DaemonClient({
		url: config.daemonUrl,
		tokenFile: config.tokenFile,
		log,
		onMessage: () => {},
		onFatal: (reason) => {
			log(reason);
			process.exit(1);
		},
	});
	void daemon;

	const shutdown = () => process.exit(0);
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	log("scaffold up: config loads; transport and bridge land in T-spike / T-bridge");
}

main();
