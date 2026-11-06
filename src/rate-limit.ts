/**
 * Rate limiter with token bucket and exponential retry queue (P1-1).
 *
 * Features:
 * - Per-phone-number token bucket (1000 msg/day base tier)
 * - In-memory queue with exponential backoff retry, bounded by `maxAttempts`
 * - Failed immediate sends are retried through the same queue (never silently lost)
 * - Metrics: rate_limit_hits, queue_depth, retry_count
 * - Warning log at 80% capacity
 */

import type { ChannelTransport } from "./whatsapp.ts";

/** Configuration for rate limiting. */
export interface RateLimitConfig {
	/** Maximum messages per day per number (base tier). */
	dailyLimit: number;
	/** Refill interval in ms (default: 1 day). */
	refillIntervalMs: number;
	/** Maximum queue depth per number. */
	maxQueueDepth: number;
	/** Initial retry delay in ms. */
	initialRetryDelayMs: number;
	/** Maximum retry delay in ms. */
	maxRetryDelayMs: number;
	/** Retry multiplier (exponential backoff). */
	retryMultiplier: number;
	/** Warning threshold as fraction of daily limit (default 0.8). */
	warningThreshold: number;
	/** Failed attempts allowed before a message is dropped and its promise rejects. */
	maxAttempts: number;
}

/** Default configuration. */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
	dailyLimit: 1000,
	refillIntervalMs: 24 * 60 * 60 * 1000, // 1 day
	maxQueueDepth: 100,
	initialRetryDelayMs: 1000, // 1s
	maxRetryDelayMs: 60_000, // 60s
	retryMultiplier: 2,
	warningThreshold: 0.8,
	maxAttempts: 5,
};

/** A queued message waiting for rate limit clearance. */
export interface QueuedMessage {
	to: string;
	text: string;
	chunks: string[];
	attempt: number;
	nextRetryAt: number;
	resolve: (value: void) => void;
	reject: (reason?: Error) => void;
}

/** Outcome of one send attempt: where it stopped, or `null` when every chunk left. */
type SendOutcome = { failedAt: number; error: Error } | { failedAt: null; error: null };

/** Per-number rate limit state. */
interface NumberState {
	tokens: number;
	lastRefill: number;
	queue: QueuedMessage[];
	retryCount: number;
	rateLimitHits: number;
}

/** Metrics snapshot. */
export interface RateLimitMetrics {
	totalNumbers: number;
	totalQueued: number;
	totalRateLimitHits: number;
	totalRetryCount: number;
	byNumber: Map<string, {
		tokens: number;
		queueDepth: number;
		retryCount: number;
		rateLimitHits: number;
	}>;
}

/**
 * Rate limiter for outbound WhatsApp messages.
 * Uses token bucket per phone number with exponential backoff retry queue.
 */
export class RateLimiter {
	private readonly config: RateLimitConfig;
	private readonly transport: ChannelTransport;
	private readonly log: (msg: string) => void;
	private readonly states = new Map<string, NumberState>();
	private readonly timers: ReturnType<typeof setInterval>[] = [];
	private processing = false;

	constructor(
		transport: ChannelTransport,
		log: (msg: string) => void,
		config: Partial<RateLimitConfig> = {}
	) {
		this.transport = transport;
		this.log = log;
		this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
		// Start periodic refill
		this.timers.push(setInterval(() => this.refill(), this.config.refillIntervalMs));
		// Start queue processor (faster for testing)
		this.timers.push(setInterval(() => this.processQueues(), 100));
	}

	/**
	 * Send a message with rate limiting.
	 * Returns a promise that resolves when the message is accepted by the transport,
	 * or rejects if the queue is full.
	 */
	async send(to: string, text: string): Promise<void> {
		const state = this.getState(to);
		const chunks = this.chunkMessage(text);

		// Check if we have enough tokens for all chunks
		if (state.tokens >= chunks.length) {
			state.tokens -= chunks.length;
			state.rateLimitHits++;
			this.maybeWarn(to, state);

			const outcome = await this.trySendChunks(to, chunks);
			if (outcome.failedAt === null) return;

			// S10: a failed immediate send is not lost — the undelivered tail goes back
			// through the queue. Chunks that already left are never resent.
			const undelivered = chunks.length - outcome.failedAt;
			state.tokens = Math.min(this.config.dailyLimit, state.tokens + undelivered);
			this.log(
				`rate limit: send failed for ${this.mask(to)} (attempt 1), ` +
					`retrying in ${this.retryDelay(1)}ms: ${outcome.error.message}`
			);
			return this.enqueue(state, to, text, chunks.slice(outcome.failedAt), 1);
		}

		return this.enqueue(state, to, text, chunks, 0);
	}

	/** Queue a message, or reject when this number's queue is already full. */
	private enqueue(
		state: NumberState,
		to: string,
		text: string,
		chunks: string[],
		attempt: number
	): Promise<void> {
		if (state.queue.length >= this.config.maxQueueDepth) {
			this.log(`rate limit: queue full for ${this.mask(to)}, dropping message`);
			return Promise.reject(new Error(`Rate limit queue full for ${this.mask(to)}`));
		}

		return new Promise<void>((resolve, reject) => {
			const queued: QueuedMessage = {
				to,
				text,
				chunks,
				attempt,
				nextRetryAt: Date.now(),
				resolve,
				reject,
			};
			state.queue.push(queued);
			this.log(`rate limit: queued message for ${this.mask(to)} (queue depth: ${state.queue.length})`);
		});
	}

	/** Delay before the next attempt once `failures` attempts have failed. */
	private retryDelay(failures: number): number {
		return Math.min(
			this.config.initialRetryDelayMs * this.config.retryMultiplier ** Math.max(0, failures - 1),
			this.config.maxRetryDelayMs
		);
	}

	/**
	 * Send chunks in order and report the index of the first failure.
	 * Chunks before it already left, so callers only retry from `failedAt` on.
	 */
	private async trySendChunks(to: string, chunks: string[]): Promise<SendOutcome> {
		for (let index = 0; index < chunks.length; index++) {
			try {
				await this.transport.sendText(to, chunks[index]);
			} catch (error) {
				return {
					failedAt: index,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		}
		return { failedAt: null, error: null };
	}

	/** Split message into chunks respecting WhatsApp limit. */
	private chunkMessage(text: string): string[] {
		const limit = 4000;
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

	/** Get or create state for a number. */
	private getState(to: string): NumberState {
		let state = this.states.get(to);
		if (!state) {
			state = {
				tokens: this.config.dailyLimit,
				lastRefill: Date.now(),
				queue: [],
				retryCount: 0,
				rateLimitHits: 0,
			};
			this.states.set(to, state);
		}
		return state;
	}

	/** Refill tokens for all numbers (called periodically). */
	private refill(): void {
		const now = Date.now();
		for (const [to, state] of this.states) {
			const elapsed = now - state.lastRefill;
			if (elapsed >= this.config.refillIntervalMs) {
				const refills = Math.floor(elapsed / this.config.refillIntervalMs);
				state.tokens = Math.min(this.config.dailyLimit, state.tokens + refills * this.config.dailyLimit);
				state.lastRefill = now;
			}
		}
	}

	/** Process all queues, sending messages when tokens available. */
	private async processQueues(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		try {
			for (const [to, state] of this.states) {
				while (state.queue.length > 0) {
					const queued = state.queue[0];
					if (queued.nextRetryAt > Date.now()) break;
					// Not enough tokens, wait for refill
					if (state.tokens < queued.chunks.length) break;

					state.tokens -= queued.chunks.length;
					state.rateLimitHits++;
					this.maybeWarn(to, state);

					const outcome = await this.trySendChunks(to, queued.chunks);
					if (outcome.failedAt === null) {
						state.queue.shift();
						queued.resolve();
						continue;
					}

					// Keep only the undelivered tail: a chunk that already left is never resent.
					const undelivered = queued.chunks.length - outcome.failedAt;
					state.tokens = Math.min(this.config.dailyLimit, state.tokens + undelivered);
					queued.chunks = queued.chunks.slice(outcome.failedAt);
					queued.attempt++;
					state.retryCount++;

					// S11: bounded retries — drop and tell the caller instead of hanging forever.
					if (queued.attempt >= this.config.maxAttempts) {
						state.queue.shift();
						this.log(
							`rate limit: dropped message for ${this.mask(to)} after ${queued.attempt} ` +
								`attempts: ${outcome.error.message}`
						);
						queued.reject(outcome.error);
						continue; // a dropped message never blocks the ones queued behind it
					}

					const delay = this.retryDelay(queued.attempt);
					queued.nextRetryAt = Date.now() + delay;
					this.log(
						`rate limit: send failed for ${this.mask(to)} (attempt ${queued.attempt}), ` +
							`retrying in ${delay}ms: ${outcome.error.message}`
					);
					break; // Stop processing this queue, will retry later
				}
			}
		} finally {
			this.processing = false;
		}
	}

	/** Log warning if approaching limit. */
	private maybeWarn(to: string, state: NumberState): void {
		const used = this.config.dailyLimit - state.tokens;
		if (used >= this.config.dailyLimit * this.config.warningThreshold) {
			this.log(
				`rate limit: ${this.mask(to)} at ${Math.round((used / this.config.dailyLimit) * 100)}% ` +
					`(${used}/${this.config.dailyLimit})`
			);
		}
	}

	/** Get current metrics snapshot. */
	getMetrics(): RateLimitMetrics {
		const byNumber = new Map();
		let totalQueued = 0;
		let totalRateLimitHits = 0;
		let totalRetryCount = 0;

		for (const [to, state] of this.states) {
			byNumber.set(to, {
				tokens: state.tokens,
				queueDepth: state.queue.length,
				retryCount: state.retryCount,
				rateLimitHits: state.rateLimitHits,
			});
			totalQueued += state.queue.length;
			totalRateLimitHits += state.rateLimitHits;
			totalRetryCount += state.retryCount;
		}

		return {
			totalNumbers: this.states.size,
			totalQueued,
			totalRateLimitHits,
			totalRetryCount,
			byNumber,
		};
	}

	/** Stop the background timers and reject all pending queued promises. Idempotent. */
	dispose(): void {
		while (this.timers.length > 0) {
			const timer = this.timers.pop();
			if (timer !== undefined) clearInterval(timer);
		}
		// Reject all queued promises so callers never hang on a disposed limiter.
		for (const state of this.states.values()) {
			for (const queued of state.queue) {
				queued.reject(new Error("RateLimiter disposed"));
			}
			state.queue.length = 0;
		}
	}

	/** Mask phone number for logging (last 4 digits). */
	private mask(number: string): string {
		return "…" + number.slice(-4);
	}
}