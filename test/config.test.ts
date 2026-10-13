import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.ts";

const ENV = { DOT_WHATSAPP_ALLOWED_NUMBERS: "+5491100001111, 5491100002222" };

describe("config", () => {
	it("parses E.164 allowlist, stripping the + and rejecting empty", () => {
		const c = loadConfig(ENV, "/home/x");
		expect([...c.allowedNumbers].sort()).toEqual(["5491100001111", "5491100002222"]);
		expect(c.authDir).toBe("/home/x/.dot-whatsapp/auth");
		expect(c.tokenFile).toBe("/home/x/.gentle-dot/token");
		expect(c.engramProject).toBe("dot-whatsapp");
	});

	it("fails closed: no allowlist, non-numeric ids, or a bad daemon URL are ConfigErrors", () => {
		expect(() => loadConfig({}, "/home/x")).toThrow(ConfigError);
		expect(() => loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: "abc" }, "/home/x")).toThrow(
			/DOT_WHATSAPP_ALLOWED_NUMBERS/,
		);
		expect(() =>
			loadConfig({ ...ENV, GENTLE_DOT_URL: "http://nope" }, "/home/x"),
		).toThrow(/GENTLE_DOT_URL/);
	});

	it("error messages never echo the secret/values they reject", () => {
		let msg = "";
		try {
			loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: "not-a-number-123" }, "/h");
		} catch (e) {
			msg = (e as Error).message;
		}
		expect(msg).not.toContain("not-a-number-123");
	});
});
