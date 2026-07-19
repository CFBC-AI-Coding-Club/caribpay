import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../constants";

export const fxQuoteQuerySchema = z.object({
  from: z.enum(SUPPORTED_CURRENCIES),
  to: z.enum(SUPPORTED_CURRENCIES),
  amountMinor: z.coerce.number().int().positive(),
});
export type FxQuoteQuery = z.infer<typeof fxQuoteQuerySchema>;

export const fxQuoteSchema = z.object({
  id: z.uuid(),
  from: z.enum(SUPPORTED_CURRENCIES),
  to: z.enum(SUPPORTED_CURRENCIES),
  rate: z.string(),
  sourceAmountMinor: z.number().int().positive(),
  destAmountMinor: z.number().int().positive(),
  expiresAt: z.string(),
});
export type FxQuote = z.infer<typeof fxQuoteSchema>;

export const fxQuoteResponseSchema = z.object({
  quote: fxQuoteSchema,
});
export type FxQuoteResponse = z.infer<typeof fxQuoteResponseSchema>;
