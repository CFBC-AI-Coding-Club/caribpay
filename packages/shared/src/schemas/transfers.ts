import { z } from "zod";
import { SUPPORTED_CURRENCIES, WALLET_ADDRESS_PATTERN } from "../constants";
import { transactionSchema } from "./transactions";

export const transferRequestSchema = z.object({
  recipientAddress: z.string().regex(WALLET_ADDRESS_PATTERN, "Not a valid wallet address"),
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
