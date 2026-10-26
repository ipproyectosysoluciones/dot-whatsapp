// The allowlist persistence (boot-restore, owner decision 2026-10-26): the
// authorized numbers survive a restart. The file is the source of truth once
// it exists (the env only seeds the first boot); reads fail safe (a corrupt
// file never bricks the bridge — it falls back to the env seed with a log).
// Full E.164 digits live ONLY in this 0600 file, never in Engram (S7).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllowlistFile, resolveAllowlist, saveAllowlistFile } from "../src/allowlist-store.ts";
import { loadConfig } from "../src/config.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function freshPath(): string {
	const dir = mkdtempSync(join(tmpdir(), "dot-wa-allowlist-"));
	dirs.push(dir);
	return join(dir, ".dot-whatsapp", "allowlist.json");
}

describe("allowlist file — save", () => {
	it("writes valid JSON with a schema marker, creating the parent dir", () => {
		const path = freshPath();
		expect(existsSync(path)).toBe(false);
		saveAllowlistFile(path, ["5491112345678", "5499998765432"]);
		expect(existsSync(path)).toBe(true);
		const parsed = JSON.parse(readFileSync(path, "utf8")) as { schema: string; numbers: string[] };
		expect(parsed.schema).toBe("dot-whatsapp.allowlist/v1");
		expect(parsed.numbers).toEqual(["5491112345678", "5499998765432"]);
	});

	it("writes the file with mode 0600 (full digits, local only)", () => {
		const path = freshPath();
		saveAllowlistFile(path, ["5491112345678"]);
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("filters invalid entries on save and persists only valid E.164", () => {
		const path = freshPath();
		saveAllowlistFile(path, ["5491112345678", "not-a-number", "+5499998765432"]);
		const parsed = JSON.parse(readFileSync(path, "utf8")) as { numbers: string[] };
		expect(parsed.numbers).toEqual(["5491112345678"]);
	});
});

describe("allowlist file — load", () => {
	it("returns null when the file does not exist (env will seed)", () => {
		expect(loadAllowlistFile(freshPath())).toBeNull();
	});

	it("round-trips what was saved", () => {
		const path = freshPath();
		saveAllowlistFile(path, ["5491112345678"]);
		expect(loadAllowlistFile(path)).toEqual(["5491112345678"]);
	});

	it("fails safe on corrupt JSON: null, never a throw", () => {
		const path = freshPath();
		saveAllowlistFile(path, ["5491112345678"]);
		writeFileSync(path, "{ broken", { mode: 0o600 });
		expect(loadAllowlistFile(path)).toBeNull();
	});

	it("filters entries that are not valid E.164 digits", () => {
		const path = freshPath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			path,
			JSON.stringify({ schema: "dot-whatsapp.allowlist/v1", numbers: ["5491112345678", "junk", 12345] }),
			{ mode: 0o600 },
		);
		expect(loadAllowlistFile(path)).toEqual(["5491112345678"]);
	});

	it("honors an intentionally empty list as an empty array (not null)", () => {
		const path = freshPath();
		saveAllowlistFile(path, []);
		expect(loadAllowlistFile(path)).toEqual([]);
	});
});

describe("config — allowlist file", () => {
	it("defaults to .dot-whatsapp/allowlist.json", () => {
		const config = loadConfig({ DOT_WHATSAPP_ALLOWED_NUMBERS: "5491112345678" }, "/home/x");
		expect(config.allowlistFile).toBe("/home/x/.dot-whatsapp/allowlist.json");
	});
});

describe("resolveAllowlist — the boot decision", () => {
	it("seeds from env when no file exists", () => {
		const result = resolveAllowlist(["5491112345678"], null);
		expect(result).toEqual({ numbers: ["5491112345678"], restored: false });
	});

	it("the file wins over env when it exists (removals survive restarts)", () => {
		const result = resolveAllowlist(["5491112345678"], ["5499998765432"]);
		expect(result).toEqual({ numbers: ["5499998765432"], restored: true });
	});

	it("honors an intentionally empty file (the bridge runs, relaying to nobody)", () => {
		const result = resolveAllowlist(["5491112345678"], []);
		expect(result).toEqual({ numbers: [], restored: true });
	});

	it("falls back to env when the stored list is empty after filtering", () => {
		const result = resolveAllowlist(["5491112345678"], ["junk"]);
		expect(result).toEqual({ numbers: ["5491112345678"], restored: false });
	});
});
