import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { maskName, type Counterparty, type TransferDirection } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { contacts, directoryKeys, users } from "../db/schema";

/** The fields of a transaction row this module needs to work out who the other party is. */
export interface PartyFields {
  senderUserId: string | null;
  recipientUserId: string | null;
}

export interface PartyView {
  direction: TransferDirection;
  counterparty: Counterparty | null;
}

function otherParty(
  row: PartyFields,
  viewerUserId: string,
): { direction: TransferDirection; userId: string } | { direction: "self" } {
  const isSender = row.senderUserId === viewerUserId;
  const isRecipient = row.recipientUserId === viewerUserId;

  if (isSender && !isRecipient && row.recipientUserId !== null) {
    return { direction: "out", userId: row.recipientUserId };
  }
  if (isRecipient && !isSender && row.senderUserId !== null) {
    return { direction: "in", userId: row.senderUserId };
  }
  return { direction: "self" };
}

/**
 * Resolve display identity for the counterparty of every row in one go — three
 * queries regardless of page size, so a feed never turns into an N+1.
 *
 * A saved contact name wins over the counterparty's own: the user named them
 * "Kemar" for a reason, and that is what the rest of the app calls them. Absent
 * a contact we show the *masked* name, matching what the directory told them
 * before they paid.
 */
export async function resolveParties(
  dbh: DbHandle,
  viewerUserId: string,
  rows: readonly PartyFields[],
): Promise<PartyView[]> {
  const wanted = rows.map((row) => otherParty(row, viewerUserId));
  const userIds = [...new Set(wanted.flatMap((w) => (w.direction === "self" ? [] : [w.userId])))];

  if (userIds.length === 0) {
    return wanted.map(() => ({ direction: "self" as const, counterparty: null }));
  }

  const [userRows, keyRows, contactRows] = await Promise.all([
    dbh
      .select({ id: users.id, fullName: users.fullName, countryCode: users.countryCode })
      .from(users)
      .where(inArray(users.id, userIds)),
    dbh
      .select({
        userId: directoryKeys.userId,
        value: directoryKeys.valueNormalized,
        isPrimary: directoryKeys.isPrimary,
      })
      .from(directoryKeys)
      .where(
        and(
          inArray(directoryKeys.userId, userIds),
          eq(directoryKeys.type, "vpa"),
          isNull(directoryKeys.releasedAt),
        ),
      )
      .orderBy(sql`${directoryKeys.isPrimary} DESC`, directoryKeys.createdAt),
    dbh
      .select({ contactUserId: contacts.contactUserId, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.ownerUserId, viewerUserId), inArray(contacts.contactUserId, userIds))),
  ]);

  const byUser = new Map(userRows.map((r) => [r.id, r]));
  // Ordered primary-first, so the first key seen for a user is the one to show.
  const vpaByUser = new Map<string, string>();
  for (const key of keyRows) {
    if (!vpaByUser.has(key.userId)) vpaByUser.set(key.userId, key.value);
  }
  const savedName = new Map(contactRows.map((r) => [r.contactUserId, r.displayName]));

  return wanted.map((w) => {
    if (w.direction === "self") return { direction: "self" as const, counterparty: null };
    const user = byUser.get(w.userId);
    if (user === undefined) return { direction: w.direction, counterparty: null };
    return {
      direction: w.direction,
      counterparty: {
        displayName: savedName.get(w.userId) ?? maskName(user.fullName),
        vpa: vpaByUser.get(w.userId) ?? null,
        countryCode: user.countryCode,
      },
    };
  });
}

/** Single-row convenience wrapper for the transfer detail endpoint. */
export async function resolveParty(
  dbh: DbHandle,
  viewerUserId: string,
  row: PartyFields,
): Promise<PartyView> {
  const [view] = await resolveParties(dbh, viewerUserId, [row]);
  return view ?? { direction: "self", counterparty: null };
}
