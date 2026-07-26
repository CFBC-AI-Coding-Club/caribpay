import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../constants";

/**
 * The signed `caribpay://pay?...` payload a receiver's screen encodes.
 *
 * It carries a VPA rather than an account reference: a QR is shown in public and
 * photographed, and the directory is the only thing that should be able to turn
 * an address into an account. The name is the *masked* one, so scanning and
 * resolving agree about who you are paying.
 */
export const qrReceiveResponseSchema = z.object({
  vpa: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  displayName: z.string(),
  countryCode: z.string().length(2),
  payload: z.string(),
});
export type QrReceiveResponse = z.infer<typeof qrReceiveResponseSchema>;

export const qrResolveQuerySchema = z.object({
  payload: z.string().min(1).max(1000),
});
export type QrResolveQuery = z.infer<typeof qrResolveQuerySchema>;

export const qrResolveResponseSchema = z.object({
  vpa: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  displayName: z.string(),
  /** Covered by the signature, so it cannot be swapped for another country. */
  countryCode: z.string().length(2),
});
export type QrResolveResponse = z.infer<typeof qrResolveResponseSchema>;
