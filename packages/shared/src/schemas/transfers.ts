import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../constants";
import { transactionSchema } from "./transactions";

/**
 * A payment instruction.
 *
 * `toKey` is whatever the payer typed — a VPA, a phone number, an email. The
 * switch resolves it; the client never sends an account reference, and could
 * not, because `resolve` does not return one.
 *
 * `sourceAccountId` is required and `sourceCurrency` is kept explicit: a payer
 * may hold several accounts, and which one funds a transfer is not something the
 * server should infer. `destAmountMinor` is deliberately absent — the server
 * re-derives it from the locked quote and never trusts a client figure.
 */
export const transferRequestSchema = z.object({
  toKey: z.string().trim().min(3).max(254),
  sourceAccountId: z.uuid(),
  sourceCurrency: z.enum(SUPPORTED_CURRENCIES),
  destCurrency: z.enum(SUPPORTED_CURRENCIES),
  sourceAmountMinor: z.number().int().positive(),
  note: z.string().trim().max(200).optional(),
  quoteId: z.uuid().optional(),
});
export type TransferRequest = z.infer<typeof transferRequestSchema>;

export const transferResponseSchema = z.object({
  transaction: transactionSchema,
});
export type TransferResponse = z.infer<typeof transferResponseSchema>;
