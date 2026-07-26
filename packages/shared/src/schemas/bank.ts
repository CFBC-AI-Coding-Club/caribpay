import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../constants";

/**
 * The wire contract between the switch and a member bank.
 *
 * `apps/api` and `apps/mock-bank` both parse these, so the boundary is checked
 * from both sides. A real bank connector implements the same shapes against
 * whatever the bank actually speaks.
 *
 * Idempotency travels in the `Idempotency-Key` header on every mutating call,
 * matching the switch's own convention rather than putting it in the body — the
 * confirm and release endpoints have no body to put it in.
 */

export const BANK_ACCOUNT_STATUSES = ["active", "frozen", "closed"] as const;
export type BankAccountStatus = (typeof BANK_ACCOUNT_STATUSES)[number];

export const verifyAccountRequestSchema = z.object({
  accountRef: z.string().trim().min(4).max(64),
});
export type VerifyAccountRequest = z.infer<typeof verifyAccountRequestSchema>;

export const verifyAccountResponseSchema = z.object({
  exists: z.boolean(),
  holderName: z.string().nullable(),
  currency: z.enum(SUPPORTED_CURRENCIES).nullable(),
  status: z.enum(BANK_ACCOUNT_STATUSES).nullable(),
  /** Last four digits, for the switch to store as a display mask. */
  accountNumberMasked: z.string().nullable(),
});
export type VerifyAccountResponse = z.infer<typeof verifyAccountResponseSchema>;

export const bankBalanceResponseSchema = z.object({
  accountRef: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  balanceMinor: z.number().int(),
  /** Balance less outstanding holds. What a debit can actually draw on. */
  availableMinor: z.number().int(),
  asOf: z.string(),
});
export type BankBalanceResponse = z.infer<typeof bankBalanceResponseSchema>;

export const holdRequestSchema = z.object({
  accountRef: z.string().trim().min(4).max(64),
  amountMinor: z.number().int().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** The switch's transaction id, for the bank's own audit trail. */
  reference: z.uuid(),
});
export type HoldRequest = z.infer<typeof holdRequestSchema>;

export const holdResponseSchema = z.object({
  holdRef: z.string(),
  amountMinor: z.number().int().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** The bank releases the hold itself past this point, so nothing strands. */
  expiresAt: z.string(),
});
export type HoldResponse = z.infer<typeof holdResponseSchema>;

export const confirmDebitResponseSchema = z.object({
  debitRef: z.string(),
  holdRef: z.string(),
  amountMinor: z.number().int().positive(),
  settledAt: z.string(),
});
export type ConfirmDebitResponse = z.infer<typeof confirmDebitResponseSchema>;

export const releaseHoldResponseSchema = z.object({
  holdRef: z.string(),
  released: z.literal(true),
});
export type ReleaseHoldResponse = z.infer<typeof releaseHoldResponseSchema>;

export const creditRequestSchema = z.object({
  accountRef: z.string().trim().min(4).max(64),
  amountMinor: z.number().int().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  reference: z.uuid(),
});
export type CreditRequest = z.infer<typeof creditRequestSchema>;

export const creditResponseSchema = z.object({
  creditRef: z.string(),
  amountMinor: z.number().int().positive(),
  postedAt: z.string(),
});
export type CreditResponse = z.infer<typeof creditResponseSchema>;

/** Outstanding holds, for `reconcile` to assert nothing is stranded. */
export const outstandingHoldSchema = z.object({
  holdRef: z.string(),
  accountRef: z.string(),
  amountMinor: z.number().int().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  reference: z.uuid(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type OutstandingHold = z.infer<typeof outstandingHoldSchema>;

export const outstandingHoldsResponseSchema = z.object({
  holds: z.array(outstandingHoldSchema),
});
export type OutstandingHoldsResponse = z.infer<typeof outstandingHoldsResponseSchema>;

/**
 * A bank's refusal codes.
 *
 * The split below is load-bearing. A **refusal** is the bank telling us the
 * instruction definitively did not happen, which is the only safe trigger for
 * the reversal path. Anything else — a timeout, a 5xx, a dropped connection —
 * leaves the outcome unknown, and an unknown credit must never cause us to
 * release the payer's hold: the credit may have landed, and releasing would
 * leave the switch short.
 *
 * When the outcome is unknown the connector re-sends the identical request with
 * the identical idempotency key. Replay makes that both the question and, if it
 * never arrived, the fix.
 */
export const BANK_REFUSAL_CODES = [
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_FROZEN",
  "ACCOUNT_CLOSED",
  "CURRENCY_MISMATCH",
  "INSUFFICIENT_FUNDS",
  "HOLD_NOT_FOUND",
  "HOLD_EXPIRED",
  "HOLD_ALREADY_SETTLED",
] as const;
export type BankRefusalCode = (typeof BANK_REFUSAL_CODES)[number];

export function isBankRefusal(code: string): code is BankRefusalCode {
  return (BANK_REFUSAL_CODES as readonly string[]).includes(code);
}
