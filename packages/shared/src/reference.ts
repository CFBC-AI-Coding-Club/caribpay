/** Crockford base32 — no I, L, O or U, so nothing is misread down a phone line. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A short, speakable reference for a transfer, derived from its id.
 *
 * The uuid is what the system stores and what every API call carries; nobody
 * can read one aloud. This renders the first 40 bits of it as eight base32
 * characters — `CP-7C10-44MD`. It is a *rendering* of the id, not a second
 * identifier: the same transfer always produces the same reference, so support
 * can compute it from the id rather than having to store a mapping.
 *
 * Also used for a send attempt that never came back, where the idempotency key
 * is the only handle that exists — and is exactly the thing that identifies
 * the attempt server-side.
 */
export function shortReference(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 10);
  let n = BigInt(`0x${hex.padEnd(10, "0")}`);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return `CP-${out.slice(0, 4)}-${out.slice(4)}`;
}
