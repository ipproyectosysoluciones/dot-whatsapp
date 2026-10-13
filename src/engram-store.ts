/**
 * Engram as the bridge's database (see the study doc, §4.1): idempotency via topic_key
 * `msg-<wa-id>` (Engram's duplicate_count is the dedup), a pinned allowlist observation,
 * and liveness notes. Baileys' crypto credentials never come here: they stay in files.
 *
 * This module talks to the local Engram HTTP API. The surface is intentionally tiny and
 * synchronous-looking so every call site can fail closed: when Engram is unreachable the
 * bridge refuses to process messages rather than risk double-sends without idempotency.
 */

export interface EngramLike {
	/** True when a messages topic_key was already stored (duplicate). */
	seen(topicKey: string): Promise<boolean>;
	/** Record an inbound message id (dedup marker) or any operational note. */
	remember(topicKey: string, title: string, content: string): Promise<void>;
}

export interface EngramOptions {
	url: string;
	project: string;
	fetchFn?: typeof fetch;
	log?(message: string): void;
	volatileMemory?: Set<string>;
}

export class EngramUnavailable extends Error {}

export function createEngramStore(options: EngramOptions): EngramLike {
	// TODO(T-impl): HTTP calls against options.url. MVP: in-memory fallback with a loud log,
	// so the Baileys spike can run before the Engram wiring lands.
	const local = options.volatileMemory ?? new Set<string>();
	options.log?.("Engram store is running on the volatile in-memory fallback (T-impl pending)");
	return {
		async seen(topicKey) {
			return local.has(topicKey);
		},
		async remember(topicKey, title, content) {
			void title;
			void content;
			local.add(topicKey);
		},
	};
}
