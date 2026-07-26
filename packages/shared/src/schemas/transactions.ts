import { z } from "zod";
import { SUPPORTED_CURRENCIES, TRANSACTION_TYPES, TRANSFER_LIFECYCLE_STATUSES } from "../constants";

/**
 * Display identity of the other party to a transfer, resolved for the
 * requesting user: their saved contact name if they have one, otherwise the
 * counterparty's own masked name.
 */
export const counterpartySchema = z.object({
  displayName: z.string(),
  /** Their primary VPA — the address a user can actually read and repeat. */
  vpa: z.string().nullable(),
  countryCode: z.string().length(2),
});
export type Counterparty = z.infer<typeof counterpartySchema>;

/** Money direction relative to the requesting user. */
export const TRANSFER_DIRECTIONS = ["in", "out", "self"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export const transactionSchema = z.object({
  id: z.uuid(),
  type: z.enum(TRANSACTION_TYPES),
  status: z.enum(TRANSFER_LIFECYCLE_STATUSES),
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
  /** What the payer typed, and the name shown at confirmation. Snapshots. */
  recipientKeyUsed: z.string().nullable(),
  recipientNameSnapshot: z.string().nullable(),
  /** Whether the requesting user sent or received this. */
  direction: z.enum(TRANSFER_DIRECTIONS),
  /** Null when the user is both parties, or the other side is a system movement. */
  counterparty: counterpartySchema.nullable(),
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
