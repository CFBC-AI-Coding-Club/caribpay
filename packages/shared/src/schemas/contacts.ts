import { z } from "zod";
import { SUPPORTED_CURRENCIES, WALLET_ADDRESS_PATTERN } from "../constants";

export const contactSchema = z.object({
  id: z.uuid(),
  contactUserId: z.uuid(),
  walletAddress: z.string().regex(WALLET_ADDRESS_PATTERN),
  displayName: z.string(),
  /** Currency of the saved wallet — drives the "· TT$" suffix on contact rows. */
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** Contact's country, for the flag badge on their avatar. */
  countryCode: z.string().length(2),
  /** Shown in the Contacts screen's "Quick send" row. */
  pinned: z.boolean(),
  createdAt: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

export const createContactRequestSchema = z.object({
  walletAddress: z.string().regex(WALLET_ADDRESS_PATTERN, "Not a valid wallet address"),
  displayName: z.string().trim().min(1).max(80),
  pinned: z.boolean().default(false),
});
export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

export const createContactResponseSchema = z.object({
  contact: contactSchema,
});
export type CreateContactResponse = z.infer<typeof createContactResponseSchema>;

export const contactsResponseSchema = z.object({
  contacts: z.array(contactSchema),
});
export type ContactsResponse = z.infer<typeof contactsResponseSchema>;
