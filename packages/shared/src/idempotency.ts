/**
 * Idempotency keys for instructions the switch sends to a member bank.
 *
 * These are **derived, never generated**. Every call the switch makes to a bank
 * is a step of one transfer, and the key is a pure function of the two. That
 * single property is what makes the rest of the design work:
 *
 * - A retry after a timeout reuses the key, so the bank replays its original
 *   answer instead of placing a second hold. Retried holds are the one failure
 *   this system cannot absorb.
 * - Because a replay is safe, re-sending an instruction is simultaneously how we
 *   *ask* whether it landed. A timed-out credit needs no lookup endpoint — send
 *   it again and the response is the truth.
 * - The recovery sweeper can pick up a transfer abandoned mid-saga with nothing
 *   but its id, and still address the exact instruction that was in flight.
 *
 * If you are tempted to add randomness, a timestamp, or an attempt counter here,
 * you are removing all three of those properties at once.
 */

export const BANK_STEPS = ["hold", "credit", "confirm", "release"] as const;
export type BankStep = (typeof BANK_STEPS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The idempotency key for one step of one transfer. Stable for the life of the
 * transaction, across process restarts and BullMQ retries.
 */
export function bankStepKey(transactionId: string, step: BankStep): string {
  if (!UUID_PATTERN.test(transactionId)) {
    // Anything but the durable transaction id would be unstable across retries,
    // which is the whole failure mode this function exists to prevent.
    throw new RangeError(`Idempotency keys need a transaction uuid, got "${transactionId}"`);
  }
  return `${transactionId}:${step}`;
}
