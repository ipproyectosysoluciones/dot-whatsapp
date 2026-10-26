/**
 * The allowlist persistence (boot-restore, S7): the authorized numbers survive
 * a restart. The file (`.dot-whatsapp/allowlist.json`, mode 0600) is the source
 * of truth once it exists — the env only seeds the first boot. Reads fail safe:
 * a missing or corrupt file yields null and the boot falls back to the env
 * seed, never bricking the bridge. Full E.164 digits live only in this file,
 * never in Engram (the Engram note stays masked).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isValidE164 } from "./config.ts";

export const ALLOWLIST_STORE_SCHEMA = "dot-whatsapp.allowlist/v1";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Persists the list (full digits), filtering anything that is not valid E.164. */
export function saveAllowlistFile(filePath: string, numbers: string[]): void {
	const valid = numbers.filter((n) => isValidE164(n));
	mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
	writeFileSync(
		filePath,
		`${JSON.stringify({ schema: ALLOWLIST_STORE_SCHEMA, numbers: valid }, null, "\t")}\n`,
		{ mode: 0o600 },
	);
}

/**
 * Reads the stored list, filtering invalid entries. Returns null when the file
 * is missing, unreadable, corrupt, or structurally wrong — the caller falls
 * back to the env seed. An intentionally empty list comes back as [].
 */
export function loadAllowlistFile(filePath: string): string[] | null {
	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObject(parsed) || parsed.schema !== ALLOWLIST_STORE_SCHEMA || !Array.isArray(parsed.numbers)) {
		return null;
	}
	return parsed.numbers.filter((n): n is string => typeof n === "string" && isValidE164(n));
}

/**
 * The boot decision: the file wins once it exists (removals survive restarts);
 * an intentionally empty file is honored (the bridge runs, relaying to
 * nobody); a stored list that holds no valid numbers at all is treated as lost
 * content and the env seed applies.
 */
export function resolveAllowlist(
	envNumbers: string[],
	stored: string[] | null,
): { numbers: string[]; restored: boolean } {
	const validEnv = envNumbers.filter((n) => isValidE164(n));
	if (stored === null) return { numbers: validEnv, restored: false };
	const valid = stored.filter((n) => isValidE164(n));
	if (stored.length > 0 && valid.length === 0) return { numbers: validEnv, restored: false };
	return { numbers: valid, restored: true };
}
