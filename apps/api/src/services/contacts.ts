import { and, desc, eq } from "drizzle-orm";
import type { Contact, CreateContactRequest } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { contacts, institutions, linkedAccounts, users } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { primaryVpaFor, resolveKey } from "./directory";

/**
 * Saved counterparties.
 *
 * The durable link is `contact_user_id`; the address is resolved fresh on every
 * read. A contact therefore keeps working after its owner changes their handle,
 * which a stored address would not.
 */
export async function listContacts(dbh: DbHandle, ownerUserId: string): Promise<Contact[]> {
  const rows = await dbh
    .select({ contact: contacts, user: users })
    .from(contacts)
    .innerJoin(users, eq(users.id, contacts.contactUserId))
    .where(eq(contacts.ownerUserId, ownerUserId))
    .orderBy(desc(contacts.pinned), contacts.displayName);

  const out: Contact[] = [];
  for (const row of rows) {
    out.push({
      id: row.contact.id,
      contactUserId: row.contact.contactUserId,
      savedKey: row.contact.savedKey,
      primaryVpa: await primaryVpaFor(dbh, row.contact.contactUserId),
      displayName: row.contact.displayName,
      currency: await defaultCurrencyFor(dbh, row.contact.contactUserId),
      countryCode: row.user.countryCode,
      pinned: row.contact.pinned,
      createdAt: row.contact.createdAt.toISOString(),
    });
  }
  return out;
}

/** The currency of the account their keys route to, or null if unlinked. */
async function defaultCurrencyFor(dbh: DbHandle, userId: string) {
  const [row] = await dbh
    .select({ currency: linkedAccounts.currency })
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.isDefault, true),
        eq(linkedAccounts.status, "active"),
      ),
    );
  return row?.currency ?? null;
}

export async function createContact(
  dbh: DbHandle,
  ownerUserId: string,
  input: CreateContactRequest,
): Promise<Contact> {
  const resolved = await resolveKey(dbh, ownerUserId, input.key);
  try {
    const [row] = await dbh
      .insert(contacts)
      .values({
        ownerUserId,
        contactUserId: resolved.userId,
        savedKey: resolved.key,
        displayName: input.displayName,
        pinned: input.pinned,
      })
      .returning();
    const [user] = await dbh
      .select({ countryCode: users.countryCode })
      .from(users)
      .where(eq(users.id, resolved.userId));
    return {
      id: row!.id,
      contactUserId: row!.contactUserId,
      savedKey: row!.savedKey,
      primaryVpa: resolved.primaryVpa,
      displayName: row!.displayName,
      currency: resolved.currency,
      countryCode: user?.countryCode ?? resolved.countryCode,
      pinned: row!.pinned,
      createdAt: row!.createdAt.toISOString(),
    };
  } catch (error) {
    if (isUniqueViolation(error, "contacts_owner_contact_uq")) {
      throw new ApiError(409, "CONTACT_EXISTS", "You have already saved them");
    }
    throw error;
  }
}

/** Institutions are needed by the contact screen's flag/labels; kept together. */
export async function institutionDisplayName(
  dbh: DbHandle,
  institutionId: string,
): Promise<string | null> {
  const [row] = await dbh
    .select({ displayName: institutions.displayName })
    .from(institutions)
    .where(eq(institutions.id, institutionId));
  return row?.displayName ?? null;
}
