/**
 * Unit tests for RateLimiter (P1-1, S10-S11)
 *
 * Contract under test:
 * - token bucket per number, chunks charged individually
 * - a failed immediate send is retried through the queue (S10), never duplicating
 *   a chunk that already left
 * - a message that keeps failing is dropped after `maxAttempts` and its promise
 *   rejects (S11); the queue keeps moving behind it
 */

import { describe, expect, it, afterEach, vi } from "vitest";
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG, type RateLimitConfig } from "../src/rate-limit.ts";
import type { ChannelTransport } from "../src/whatsapp.ts";

const TEST_NUMBER = "5491112345678";

/** Limiters created by a test, disposed after it (the constructor owns two intervals). */
const active: RateLimiter[] = [];

afterEach(() => {
	while (active.length > 0) active.pop()!.dispose();
	vi.useRealTimers();
});

function track(limiter: RateLimiter): RateLimiter {
	active.push(limiter);
	return limiter;
}

function createMockTransport() {
	const sent: { to: string; text: string }[] = [];
	return {
		sendText: vi.fn(async (to: string, text: string) => {
			sent.push({ to, text });
		}),
		_sent: sent,
	};
}

type LogMock = ReturnType<typeof vi.fn<(msg: string) => void>>;

function createRateLimiter(
	config: Partial<RateLimitConfig> = {},
	injectedLog?: LogMock
) {
	const transport = createMockTransport();
	const log: LogMock = injectedLog ?? vi.fn<(msg: string) => void>();
	const limiter = track(new RateLimiter(transport as unknown as ChannelTransport, log, config));
	return { limiter, transport, log };
}

/** Force tokens for one number, simulating a refill without waiting a day. */
function grantTokens(limiter: RateLimiter, to: string, tokens: number): void {
	const state = (limiter as unknown as { states: Map<string, { tokens: number }> }).states.get(to);
	if (!state) throw new Error(`no state for ${to}`);
	state.tokens = tokens;
}


describe("RateLimiter (P1-1)", () => {
	it("sends immediately when tokens available", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "hello");

		expect(transport._sent).toHaveLength(1);
		expect(transport._sent[0].text).toBe("hello");
	});

	it("deducts tokens per chunk", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "A".repeat(5000)); // 2 chunks

		expect(transport._sent).toHaveLength(2);
	});

	it("tracks rateLimitHits for immediate sends", async () => {
		const { limiter } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		const metrics = limiter.getMetrics();
		expect(metrics.totalRateLimitHits).toBe(2);
		expect(metrics.byNumber.get(TEST_NUMBER)!.rateLimitHits).toBe(2);
	});

	it("queues when tokens exhausted", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 2, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		const promise = limiter.send(TEST_NUMBER, "three");
		expect(transport._sent).toHaveLength(2);

		grantTokens(limiter, TEST_NUMBER, 1);
		await promise;

		expect(transport._sent).toHaveLength(3);
		expect(transport._sent[2].text).toBe("three");
	}, 10000);

	it("rejects when queue full", async () => {
		const { limiter } = createRateLimiter({
			dailyLimit: 1,
			maxQueueDepth: 1,
			refillIntervalMs: 60_000,
		});

		await limiter.send(TEST_NUMBER, "one"); // uses the only token

		// Queued by design: this promise stays pending until a refill, never awaited here.
		limiter.send(TEST_NUMBER, "two").catch(() => {});
		await Promise.resolve();

		await expect(limiter.send(TEST_NUMBER, "three")).rejects.toThrow("Rate limit queue full");
	});

	it("processes queue when tokens refill", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 1, refillIntervalMs: 100 });

		await limiter.send(TEST_NUMBER, "one");

		const promise = limiter.send(TEST_NUMBER, "two");
		expect(transport._sent).toHaveLength(1);

		grantTokens(limiter, TEST_NUMBER, 1);
		await promise;

		expect(transport._sent).toHaveLength(2);
	}, 10000);

	it("tracks metrics correctly", async () => {
		const { limiter } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		const metrics = limiter.getMetrics();
		expect(metrics.totalNumbers).toBe(1);
		expect(metrics.totalRateLimitHits).toBe(2);
		expect(metrics.totalQueued).toBe(0);
		expect(metrics.byNumber.has(TEST_NUMBER)).toBe(true);
	});

	it("masks numbers in logs at 80% threshold", async () => {
		const log = vi.fn<(msg: string) => void>();
		const { limiter } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 }, log);

		for (let i = 0; i < 8; i++) {
			await limiter.send(TEST_NUMBER, `msg${i}`);
		}

		const calls = log.mock.calls.map((c) => String(c[0]));
		const warningCalls = calls.filter((c) => c.includes("rate limit:") && c.includes("80%"));
		expect(warningCalls.length).toBeGreaterThan(0);
		expect(warningCalls[0]).toContain("…5678");
		expect(warningCalls[0]).not.toContain(TEST_NUMBER);
	});

	it("retries a failed immediate send instead of losing the message (S10)", async () => {
		const delivered: string[] = [];
		const sendText = vi
			.fn()
			.mockRejectedValueOnce(new Error("network error"))
			.mockImplementation(async (_to: string, text: string) => {
				delivered.push(text);
			});
		const log = vi.fn();
		const limiter = track(
			new RateLimiter({ sendText } as unknown as ChannelTransport, log, {
				dailyLimit: 10,
				initialRetryDelayMs: 10,
				maxRetryDelayMs: 50,
				retryMultiplier: 2,
			})
		);

		await limiter.send(TEST_NUMBER, "hola");

		expect(sendText).toHaveBeenCalledTimes(2);
		expect(delivered).toEqual(["hola"]);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("retrying"));
	}, 10000);

	it("does not duplicate chunks that already left when a send fails mid-message (S10)", async () => {
		const delivered: string[] = [];
		let call = 0;
		const sendText = vi.fn(async (_to: string, text: string) => {
			call++;
			if (call === 2) throw new Error("network error"); // second chunk fails once
			delivered.push(text);
		});
		const limiter = track(
			new RateLimiter({ sendText } as unknown as ChannelTransport, vi.fn(), {
				dailyLimit: 10,
				initialRetryDelayMs: 10,
				maxRetryDelayMs: 50,
				retryMultiplier: 2,
			})
		);

		await limiter.send(TEST_NUMBER, "A".repeat(5000));

		expect(sendText).toHaveBeenCalledTimes(3);
		expect(delivered).toEqual(["A".repeat(4000), "A".repeat(1000)]);
	}, 10000);

	it("drops a message that keeps failing after maxAttempts and rejects (S11)", async () => {
		const sendText = vi.fn().mockRejectedValue(new Error("network error"));
		const log = vi.fn();
		const limiter = track(
			new RateLimiter({ sendText } as unknown as ChannelTransport, log, {
				dailyLimit: 10,
				initialRetryDelayMs: 10,
				maxRetryDelayMs: 20,
				retryMultiplier: 2,
				maxAttempts: 3,
			})
		);

		await expect(limiter.send(TEST_NUMBER, "x")).rejects.toThrow("network error");

		expect(sendText).toHaveBeenCalledTimes(3);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("dropped"));
		expect(limiter.getMetrics().totalQueued).toBe(0);
	}, 10000);

	it("keeps the queue moving behind a dropped message (S11)", async () => {
		const delivered: string[] = [];
		const sendText = vi.fn(async (_to: string, text: string) => {
			if (text === "bad") throw new Error("network error");
			delivered.push(text);
		});
		const limiter = track(
			new RateLimiter({ sendText } as unknown as ChannelTransport, vi.fn(), {
				dailyLimit: 1,
				maxQueueDepth: 5,
				initialRetryDelayMs: 10,
				maxRetryDelayMs: 20,
				retryMultiplier: 2,
				maxAttempts: 2,
				refillIntervalMs: 60_000,
			})
		);

		await limiter.send(TEST_NUMBER, "first"); // burns the only token
		const bad = limiter.send(TEST_NUMBER, "bad");
		const good = limiter.send(TEST_NUMBER, "good");
		grantTokens(limiter, TEST_NUMBER, 1);

		await expect(bad).rejects.toThrow("network error");
		await expect(good).resolves.toBeUndefined();
		expect(delivered).toEqual(["first", "good"]);
		expect(sendText).toHaveBeenCalledTimes(4); // first, bad x2, good
	}, 10000);

	it("stops processing the queue after dispose and rejects pending promises", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 1, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "one");
		const pending = limiter.send(TEST_NUMBER, "two");
		const pendingRejection = expect(pending).rejects.toThrow("RateLimiter disposed");

		limiter.dispose();
		grantTokens(limiter, TEST_NUMBER, 1);
		await new Promise((r) => setTimeout(r, 250));

		// Nothing queued is delivered after dispose, and no caller promise is left hanging.
		expect(transport._sent).toHaveLength(1);
		expect(limiter.getMetrics().totalQueued).toBe(0);
		await pendingRejection;
		limiter.dispose(); // idempotent
	}, 10000);
});

describe("RateLimitConfig", () => {
	it("defaults maxAttempts to 5", () => {
		expect(DEFAULT_RATE_LIMIT_CONFIG.maxAttempts).toBe(5);
		expect(DEFAULT_RATE_LIMIT_CONFIG.retryMultiplier).toBe(2);
	});
});
