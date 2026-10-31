/**
 * Unit tests for RateLimiter (P1-1)
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from "../src/rate-limit.ts";

const TEST_NUMBER = "5491112345678";

function createMockTransport() {
	const sent: { to: string; text: string }[] = [];
	return {
		sendText: vi.fn(async (to: string, text: string) => {
			sent.push({ to, text });
		}),
		_sent: sent,
	};
}

function createRateLimiter(overrides: Partial<typeof DEFAULT_RATE_LIMIT_CONFIG> = {}) {
	const transport = createMockTransport();
	const log = vi.fn();
	const limiter = new RateLimiter(transport, log, overrides);
	return { limiter, transport, log };
}

describe("RateLimiter (P1-1)", () => {
	let { limiter, transport } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 });

	beforeEach(() => {
		({ limiter, transport } = createRateLimiter({ dailyLimit: 10, refillIntervalMs: 60_000 }));
	});

	it("sends immediately when tokens available", async () => {
		await limiter.send(TEST_NUMBER, "hello");
		expect(transport._sent).toHaveLength(1);
		expect(transport._sent[0].text).toBe("hello");
	});

	it("deducts tokens per chunk", async () => {
		const longText = "A".repeat(5000); // 2 chunks
		await limiter.send(TEST_NUMBER, longText);
		expect(transport._sent).toHaveLength(2);
	});

	it("tracks rateLimitHits for immediate sends", async () => {
		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		const metrics = limiter.getMetrics();
		expect(metrics.totalRateLimitHits).toBe(2);
		expect(metrics.byNumber.get(TEST_NUMBER)!.rateLimitHits).toBe(2);
	});

	it("queues when tokens exhausted", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 2, refillIntervalMs: 60_000 });

		// Use up all tokens
		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		// Third should queue (returns a promise that resolves later)
		const promise = limiter.send(TEST_NUMBER, "three");
		
		// Should not have sent yet (queued)
		expect(transport._sent).toHaveLength(2);
		
		// Manually add tokens to allow processing
		const state = (limiter as any).states.get(TEST_NUMBER);
		if (state) {
			state.tokens = 1;
		}
		
		// Wait for queue processor (runs every 100ms)
		await new Promise(r => setTimeout(r, 200));
		
		await promise;
		expect(transport._sent).toHaveLength(3);
	}, 10000);

	it("rejects when queue full", async () => {
		const { limiter } = createRateLimiter({ dailyLimit: 1, maxQueueDepth: 1, refillIntervalMs: 60_000 });

		await limiter.send(TEST_NUMBER, "one"); // uses token
		await limiter.send(TEST_NUMBER, "two"); // queued

		await expect(limiter.send(TEST_NUMBER, "three")).rejects.toThrow("Rate limit queue full");
	});

	it("processes queue when tokens refill", async () => {
		const { limiter, transport } = createRateLimiter({ dailyLimit: 1, refillIntervalMs: 100 });

		await limiter.send(TEST_NUMBER, "one"); // uses token

		// Queue a message
		const promise = limiter.send(TEST_NUMBER, "two");
		expect(transport._sent).toHaveLength(1); // Only first sent

		// Simulate refill by manually adding tokens
		const state = (limiter as any).states.get(TEST_NUMBER);
		if (state) {
			state.tokens = 1;
		}

		// Wait for queue processor (runs every 100ms)
		await new Promise(r => setTimeout(r, 200));
		
		await promise;
		expect(transport._sent).toHaveLength(2);
	}, 10000);

	it("tracks metrics correctly", async () => {
		const { limiter } = createRateLimiter({ dailyLimit: 10 });
		await limiter.send(TEST_NUMBER, "one");
		await limiter.send(TEST_NUMBER, "two");

		const metrics = limiter.getMetrics();
		expect(metrics.totalNumbers).toBe(1);
		expect(metrics.totalRateLimitHits).toBe(2);
		expect(metrics.byNumber.has(TEST_NUMBER)).toBe(true);
		expect(metrics.byNumber.get(TEST_NUMBER)!.rateLimitHits).toBe(2);
	});

	it("masks numbers in logs at 80% threshold", async () => {
		const log = vi.fn();
		const { limiter } = createRateLimiter({ dailyLimit: 10, log });

		// Send 8 messages to reach 80% (8/10 = 80%)
		for (let i = 0; i < 8; i++) {
			await limiter.send(TEST_NUMBER, `msg${i}`);
		}

		// Check log was called with masked number at 80% threshold
		const calls = log.mock.calls.map(c => c[0]);
		const warningCalls = calls.filter(c => c.includes("rate limit:") && c.includes("80%"));
		expect(warningCalls.length).toBeGreaterThan(0);
		expect(warningCalls[0]).toContain("…5678");
	});

	it("exponential backoff on send failure", async () => {
		const failingTransport = {
			sendText: vi.fn()
				.mockRejectedValueOnce(new Error("network error"))
				.mockResolvedValue(undefined),
			_sent: [],
		};
		const log = vi.fn();
		const limiter = new RateLimiter(failingTransport as any, log, {
			dailyLimit: 10,
			initialRetryDelayMs: 10,
			maxRetryDelayMs: 100,
			retryMultiplier: 2,
		});

		// This will queue and fail, then retry
		const promise = limiter.send(TEST_NUMBER, "test");
		
		// Wait for initial attempt + retry
		await new Promise(r => setTimeout(r, 100));
		
		// Should have retried at least once
		expect(failingTransport.sendText).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("retrying"));
		
		// Resolve the promise to clean up
		await promise.catch(() => {});
	}, 10000);
});