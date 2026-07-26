import { z } from "zod";
import { LINKED_ACCOUNT_STATUSES, SUPPORTED_CURRENCIES } from "../constants";

/**
 * A bank account the user has linked to the switch.
 *
 * **There is no balance field here, and there must never be one.** The switch
 * does not hold customer money and does not cache what the bank holds; a balance
 * on this shape would be a number we could be wrong about. Balances come from
 * `accountBalanceSchema`, live, on request.
 */
export const linkedAccountSchema = z.object({
  id: z.uuid(),
  institutionId: z.uuid(),
  institutionDisplayName: z.string(),
  countryCode: z.string().length(2),
  /** Last four digits only, formatted for display: "••••4321". */
  accountNumberMasked: z.string(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** The holder name the bank returned at link time, masked. */
  holderNameVerified: z.string(),
  isDefault: z.boolean(),
  status: z.enum(LINKED_ACCOUNT_STATUSES),
  createdAt: z.string(),
});
export type LinkedAccount = z.infer<typeof linkedAccountSchema>;

export const accountsResponseSchema = z.object({
  accounts: z.array(linkedAccountSchema),
});
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;

export const linkAccountRequestSchema = z.object({
  institutionId: z.uuid(),
  /** The account identifier at the bank. Verified before anything is stored. */
  accountRef: z.string().trim().min(4).max(64),
  makeDefault: z.boolean().default(false),
});
export type LinkAccountRequest = z.infer<typeof linkAccountRequestSchema>;

export const linkAccountResponseSchema = z.object({
  account: linkedAccountSchema,
});
export type LinkAccountResponse = z.infer<typeof linkAccountResponseSchema>;

/**
 * A balance as the bank reported it, just now. `asOf` is on the wire because the
 * UI states when it was true — the switch has no opinion of its own about it.
 */
export const accountBalanceSchema = z.object({
  accountId: z.uuid(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  balanceMinor: z.number().int(),
  /** Balance less any holds the bank is currently reserving. */
  availableMinor: z.number().int(),
  asOf: z.string(),
});
export type AccountBalance = z.infer<typeof accountBalanceSchema>;

export const accountBalanceResponseSchema = z.object({
  balance: accountBalanceSchema,
});
export type AccountBalanceResponse = z.infer<typeof accountBalanceResponseSchema>;
