import { z } from "zod";
import { SUPPORTED_CURRENCIES, WALLET_ADDRESS_PATTERN } from "../constants";

// The QR payload is the full `caribpay://pay?...` URI the app encodes into the
// QR image. `payload` round-trips to /qr/resolve to verify the signature.
export const qrReceiveResponseSchema = z.object({
  walletAddress: z.string().regex(WALLET_ADDRESS_PATTERN),
  currency: z.enum(SUPPORTED_CURRENCIES),
  displayName: z.string(),
  payload: z.string(),
});
export type QrReceiveResponse = z.infer<typeof qrReceiveResponseSchema>;

export const qrResolveQuerySchema = z.object({
  payload: z.string().min(1).max(1000),
});
export type QrResolveQuery = z.infer<typeof qrResolveQuerySchema>;

export const qrResolveResponseSchema = z.object({
  walletAddress: z.string().regex(WALLET_ADDRESS_PATTERN),
  currency: z.enum(SUPPORTED_CURRENCIES),
  displayName: z.string(),
  /** Covered by the signature, so it cannot be swapped for another country. */
  countryCode: z.string().length(2),
});
export type QrResolveResponse = z.infer<typeof qrResolveResponseSchema>;
