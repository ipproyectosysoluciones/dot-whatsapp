import { describe, expect, it } from "vitest";
import { createEngramStore } from "../src/engram-store.ts";

describe("engram store: seen()", () => {
	it("is FALSE when the CLI echoes the key inside a 'No memories found' line", async () => {
		const store = createEngramStore({
			project: "t",
			exec: async () => ({ stdout: 'No memories found for: "msg-ABC123"\n' }),
		});
		expect(await store.seen("msg-ABC123")).toBe(false);
	});

	it("is TRUE when a stored observation actually contains the topic key", async () => {
		const store = createEngramStore({
			project: "t",
			exec: async () => ({ stdout: "dot-whatsapp inbound msg-ABC123\ntopic_key: msg-ABC123\n" }),
		});
		expect(await store.seen("msg-ABC123")).toBe(true);
	});
});
