import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../constants";

/**
 * A saved counterparty.
 *
 * `savedKey` is what the owner typed when they saved them, kept for the receipt
 * trail. `primaryVpa` is resolved live from the directory, so a contact keeps
 * working after its owner changes their handle — the durable link is the user,
 * not the address.
 */
export const contactSchema = z.object({
  id: z.uuid(),
  contactUserId: z.uuid(),
  savedKey: z.string(),
  primaryVpa: z.string().nullable(),
  displayName: z.string(),
  /** Currency of the account their primary key routes to. */
  currency: z.enum(SUPPORTED_CURRENCIES).nullable(),
  countryCode: z.string().length(2),
  pinned: z.boolean(),
  createdAt: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

export const createContactRequestSchema = z.object({
  /** A VPA, phone, or email. Resolved before the contact is saved. */
  key: z.string().trim().min(3).max(254),
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
