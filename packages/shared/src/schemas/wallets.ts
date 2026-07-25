import { z } from "zod";
import { SUPPORTED_CURRENCIES, WALLET_ADDRESS_PATTERN } from "../constants";

export const walletSchema = z.object({
  id: z.uuid(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  address: z.string().regex(WALLET_ADDRESS_PATTERN),
  balanceMinor: z.number().int().min(0),
  createdAt: z.string(),
});
export type Wallet = z.infer<typeof walletSchema>;

export const walletsResponseSchema = z.object({
  wallets: z.array(walletSchema),
  totalBalance: z.object({
    currency: z.enum(SUPPORTED_CURRENCIES),
    amountMinor: z.number().int().min(0),
  }),
});
export type WalletsResponse = z.infer<typeof walletsResponseSchema>;

/**
 * Public directory lookup for a wallet address, so "Add contact" and "Send to
 * address" can confirm who they are about to save or pay before committing.
 * Exposes no more than a completed transfer already would, and is auth-gated.
 */
export const addressLookupQuerySchema = z.object({
  address: z.string().regex(WALLET_ADDRESS_PATTERN, "Not a valid wallet address"),
});
export type AddressLookupQuery = z.infer<typeof addressLookupQuerySchema>;

export const addressLookupResponseSchema = z.object({
  walletAddress: z.string().regex(WALLET_ADDRESS_PATTERN),
  currency: z.enum(SUPPORTED_CURRENCIES),
  displayName: z.string(),
  countryCode: z.string().length(2),
});
export type AddressLookupResponse = z.infer<typeof addressLookupResponseSchema>;

export const createWalletRequestSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});
export type CreateWalletRequest = z.infer<typeof createWalletRequestSchema>;

export const createWalletResponseSchema = z.object({
  wallet: walletSchema,
});
export type CreateWalletResponse = z.infer<typeof createWalletResponseSchema>;
