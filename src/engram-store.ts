/**
 * Engram as the bridge's database (see the study doc, §4.1): idempotency via topic_key
 * `msg-<wa-id>` (Engram's dedup is the anchor), plus liveness notes. Baileys' crypto
 * credentials never come here: they stay in 0700 files.
 *
 * The storage path is the `engram` CLI in a subprocess (the documented public surface);
 * the MCP/HTTP API shape changes between releases, the CLI's `save`/`search` do not.
 * Every call fails closed: when the CLI errors, the bridge refuses rather than risking
 * a double-send without idempotency.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export class EngramUnavailable extends Error {}

export interface EngramLike {
	/** True when this topic key was already stored (duplicate). */
	seen(topicKey: string): Promise<boolean>;
	/** Record an inbound message id (dedup marker) or an operational note. */
	remember(topicKey: string, title: string, content: string): Promise<void>;
}

export interface EngramOptions {
	/** Engram project receiving this bridge's observations (default dot-whatsapp). */
	project: string;
	/** Test seam. */
	exec?: (args: string[]) => Promise<{ stdout: string }>;
	log?(message: string): void;
}

export function createEngramStore(options: EngramOptions): EngramLike {
	const exec =
		options.exec ??
		(async (args: string[]) => {
			const { stdout } = await run("engram", [...args, "--project", options.project], {
				timeout: 10_000,
			});
			return { stdout };
		});
	const log = options.log ?? (() => {});
	return {
		async seen(topicKey) {
			const { stdout } = await exec(["search", topicKey, "--match", "all", "--limit", "1"]);
			// The CLI echoes the query back inside "No memories found for: <query>", so a plain
			// includes(topicKey) always wins — check the negative marker first.
			if (stdout.includes("No memories found")) return false;
			return stdout.includes(topicKey);
		},
		async remember(topicKey, title, content) {
			await exec(["save", title, `topic_key: ${topicKey}\n${content}`, "--type", "pattern"]);
			log(`engram: stored ${topicKey}`);
		},
	};
}
