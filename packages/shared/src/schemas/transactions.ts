import { z } from "zod";
import { SUPPORTED_CURRENCIES, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../constants";

export const transactionSchema = z.object({
  id: z.uuid(),
  type: z.enum(TRANSACTION_TYPES),
  status: z.enum(TRANSACTION_STATUSES),
  sourceCurrency: z.enum(SUPPORTED_CURRENCIES),
  destCurrency: z.enum(SUPPORTED_CURRENCIES),
  sourceAmountMinor: z.number().int().positive(),
  destAmountMinor: z.number().int().positive(),
  fxRateUsed: z.string().nullable(),
  note: z.string().nullable(),
  senderUserId: z.uuid().nullable(),
  recipientUserId: z.uuid().nullable(),
  failureReason: z.string().nullable(),
  settledAt: z.string().nullable(),
  createdAt: z.string(),
  /** Net effect on the wallet the feed was scoped to; absent in unscoped feeds. */
  walletDeltaMinor: z.number().int().optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionsPageQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type TransactionsPageQuery = z.infer<typeof transactionsPageQuerySchema>;

export const transactionsPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.uuid().nullable(),
});
export type TransactionsPage = z.infer<typeof transactionsPageSchema>;
