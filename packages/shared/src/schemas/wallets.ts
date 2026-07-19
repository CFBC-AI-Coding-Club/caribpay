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

export const createWalletRequestSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
});
export type CreateWalletRequest = z.infer<typeof createWalletRequestSchema>;

export const createWalletResponseSchema = z.object({
  wallet: walletSchema,
});
export type CreateWalletResponse = z.infer<typeof createWalletResponseSchema>;
