import { and, desc, eq } from "drizzle-orm";
import type { Contact, Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { contacts, users, wallets } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";

type ContactRow = typeof contacts.$inferSelect;

/**
 * Contact rows store only the address, but the UI shows the wallet's currency
 * and a flag for the contact's country — so both are joined in on read.
 */
function toPublicContact(
  row: ContactRow,
  currency: Currency,
  countryCode: string,
): Contact {
  return {
    id: row.id,
    contactUserId: row.contactUserId,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    currency,
    countryCode,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createContact(
  dbh: DbHandle,
  ownerUserId: string,
  walletAddress: string,
  displayName: string,
  pinned = false,
): Promise<Contact> {
  const [target] = await dbh
    .select({
      userId: wallets.userId,
      currency: wallets.currency,
      countryCode: users.countryCode,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.address, walletAddress));
  if (target === undefined) {
    throw new ApiError(404, "ADDRESS_NOT_FOUND", "No wallet found for that address");
  }
  if (target.userId === ownerUserId) {
    throw new ApiError(422, "SELF_CONTACT", "You cannot add your own wallet as a contact");
  }
  try {
    const [row] = await dbh
      .insert(contacts)
      .values({ ownerUserId, contactUserId: target.userId, walletAddress, displayName, pinned })
      .returning();
    return toPublicContact(row!, target.currency, target.countryCode);
  } catch (error) {
    if (isUniqueViolation(error, "contacts_owner_address_uq")) {
      throw new ApiError(409, "CONTACT_EXISTS", "This address is already in your contacts");
    }
    throw error;
  }
}

export async function listContacts(dbh: DbHandle, ownerUserId: string): Promise<Contact[]> {
  const rows = await dbh
    .select({
      contact: contacts,
      currency: wallets.currency,
      countryCode: users.countryCode,
    })
    .from(contacts)
    .innerJoin(wallets, eq(wallets.address, contacts.walletAddress))
    .innerJoin(users, eq(users.id, contacts.contactUserId))
    .where(eq(contacts.ownerUserId, ownerUserId))
    // Pinned first so the client can slice the "Quick send" row off the top.
    .orderBy(desc(contacts.pinned), desc(contacts.createdAt));
  return rows.map((r) => toPublicContact(r.contact, r.currency, r.countryCode));
}
