/**
 * Random UUID-v4-shaped string for idempotency keys. Not cryptographically
 * strong — it only needs to be unique per transfer attempt, and the server
 * treats the key as opaque.
 */
export function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
