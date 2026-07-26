/**
 * Virtual Payment Addresses and the other directory key types.
 *
 * A VPA is `local@psp` — `fraimer@caribpay`. The suffix is a PSP handle, not a
 * brand, so a member bank joining later owns `@ncb` without a migration.
 *
 * Everything here is a pure function on strings, and both the API and the mobile
 * client call the same one. A key that normalises differently on the two sides
 * would resolve to a different person, which in an irreversible system means
 * money reaching a stranger.
 */

import type { DirectoryKeyType } from "./constants";

export const VPA_LOCAL_MIN = 3;
export const VPA_LOCAL_MAX = 20;

/** Lowercase, starts with a letter, and no consecutive or trailing dots. */
const VPA_LOCAL_PATTERN = /^[a-z](?:[a-z0-9_-]|\.(?!\.))*$/;

export interface ParsedDirectoryKey {
  type: DirectoryKeyType;
  /** Normalised, ready to compare against `directory_keys.value_normalized`. */
  value: string;
}

/** NFKC + casefold + trim. Applied before anything else looks at a key. */
export function normalizeVpa(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

/** Split on the last `@`. Null unless both sides are non-empty. */
export function splitVpa(input: string): { local: string; psp: string } | null {
  const at = input.lastIndexOf("@");
  if (at <= 0 || at === input.length - 1) return null;
  return { local: input.slice(0, at), psp: input.slice(at + 1) };
}

export function isValidVpaLocalPart(local: string): boolean {
  if (local.length < VPA_LOCAL_MIN || local.length > VPA_LOCAL_MAX) return false;
  if (local.endsWith(".")) return false;
  return VPA_LOCAL_PATTERN.test(local);
}

// Visually confusable characters, collapsed onto one representative. Deliberately
// the documented set and no wider: every pair added here also forbids a
// legitimate handle, so the list grows only with a reason.
const CONFUSABLES: Record<string, string> = {
  "0": "o",
  "1": "i",
  l: "i",
  "5": "s",
};

const SEPARATORS = /[._-]/g;

/**
 * A canonical form in which lookalikes collide. `fra1mer` and `fraimer` share a
 * skeleton, so the second cannot be registered while the first is live.
 *
 * Order matters: separators go first so `n-c-b` reaches `ncb`, then the digraph,
 * then single characters — otherwise `1` would already be `i` and `rn` would
 * never match.
 */
export function vpaSkeleton(input: string): string {
  const flattened = normalizeVpa(input).replace(SEPARATORS, "").replace(/rn/g, "m");
  let out = "";
  for (const char of flattened) {
    out += CONFUSABLES[char] ?? char;
  }
  return out;
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Normalise a phone number to E.164, or null.
 *
 * We require the caller to supply the country code rather than inferring it: +1
 * covers eight of our twelve countries and they are told apart by area code, so
 * guessing from a bare national number would route money to the wrong island.
 */
export function normalizeE164(input: string): string | null {
  const trimmed = input.normalize("NFKC").trim();
  if (!trimmed.startsWith("+")) return null;
  const candidate = "+" + trimmed.slice(1).replace(/[\s().-]/g, "");
  return E164_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Classify and normalise whatever the user typed into the recipient field.
 *
 * VPA and email are told apart by a dot in the suffix: PSP handles are single
 * labels (`caribpay`, `sknanb`), and a public email domain always has one.
 */
export function parseDirectoryKey(input: string): ParsedDirectoryKey | null {
  const trimmed = input.normalize("NFKC").trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("+")) {
    const phone = normalizeE164(trimmed);
    return phone === null ? null : { type: "phone", value: phone };
  }

  const normalized = normalizeVpa(trimmed);
  const parts = splitVpa(normalized);
  if (parts === null) return null;

  if (parts.psp.includes(".")) {
    return { type: "email", value: normalized };
  }
  if (!isValidVpaLocalPart(parts.local)) return null;
  return { type: "vpa", value: normalized };
}

/**
 * Display identity for someone the viewer may not know: first name plus the
 * last name's initial. The directory is a lookup oracle over phone numbers and
 * handles, so it never returns a full legal name.
 */
export function maskName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!;

  const first = words[0]!;
  const initial = Array.from(words[words.length - 1]!)[0] ?? "";
  return initial === "" ? first : `${first} ${initial.toUpperCase()}.`;
}
