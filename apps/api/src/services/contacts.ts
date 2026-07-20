import { and, desc, eq } from "drizzle-orm";
import type { Contact } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { contacts, wallets } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";

type ContactRow = typeof contacts.$inferSelect;

function toPublicContact(row: ContactRow): Contact {
  return {
    id: row.id,
    contactUserId: row.contactUserId,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createContact(
  dbh: DbHandle,
  ownerUserId: string,
  walletAddress: string,
  displayName: string,
): Promise<Contact> {
  const [target] = await dbh
    .select({ userId: wallets.userId })
    .from(wallets)
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
      .values({ ownerUserId, contactUserId: target.userId, walletAddress, displayName })
      .returning();
    return toPublicContact(row!);
  } catch (error) {
    if (isUniqueViolation(error, "contacts_owner_address_uq")) {
      throw new ApiError(409, "CONTACT_EXISTS", "This address is already in your contacts");
    }
    throw error;
  }
}

export async function listContacts(dbh: DbHandle, ownerUserId: string): Promise<Contact[]> {
  const rows = await dbh
    .select()
    .from(contacts)
    .where(eq(contacts.ownerUserId, ownerUserId))
    .orderBy(desc(contacts.createdAt));
  return rows.map(toPublicContact);
}
