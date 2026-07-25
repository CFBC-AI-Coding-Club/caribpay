import { and, eq, inArray } from "drizzle-orm";
import type { Counterparty, Currency, TransferDirection } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { contacts, users, wallets } from "../db/schema";

/** The fields of a transaction row this module needs to work out who the other party is. */
export interface PartyFields {
  senderUserId: string | null;
  recipientUserId: string | null;
  sourceCurrency: Currency;
  destCurrency: Currency;
}

export interface PartyView {
  direction: TransferDirection;
  counterparty: Counterparty | null;
}

/**
 * Which side of a transfer the viewer is on, and whose wallet the UI should
 * show. A transfer the viewer sent shows the *recipient's* wallet in the
 * destination currency; one they received shows the sender's source wallet.
 */
function otherParty(
  row: PartyFields,
  viewerUserId: string,
): { direction: TransferDirection; userId: string; currency: Currency } | { direction: "self" } {
  const isSender = row.senderUserId === viewerUserId;
  const isRecipient = row.recipientUserId === viewerUserId;

  if (isSender && !isRecipient && row.recipientUserId !== null) {
    return { direction: "out", userId: row.recipientUserId, currency: row.destCurrency };
  }
  if (isRecipient && !isSender && row.senderUserId !== null) {
    return { direction: "in", userId: row.senderUserId, currency: row.sourceCurrency };
  }
  // Both sides, or a leg with no counterparty user (deposits, own conversions).
  return { direction: "self" };
}

const key = (userId: string, currency: Currency): string => `${userId}:${currency}`;

/**
 * Resolve display identity for the counterparty of every row in one go — two
 * queries regardless of page size, so the feed never turns into an N+1.
 *
 * A saved contact name wins over the counterparty's own name: the user named
 * them "Kemar" for a reason, and that is what the rest of the app calls them.
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

  const [walletRows, contactRows] = await Promise.all([
    dbh
      .select({
        userId: wallets.userId,
        currency: wallets.currency,
        address: wallets.address,
        fullName: users.fullName,
        countryCode: users.countryCode,
      })
      .from(wallets)
      .innerJoin(users, eq(users.id, wallets.userId))
      .where(inArray(wallets.userId, userIds)),
    dbh
      .select({ contactUserId: contacts.contactUserId, displayName: contacts.displayName })
      .from(contacts)
      .where(and(eq(contacts.ownerUserId, viewerUserId), inArray(contacts.contactUserId, userIds))),
  ]);

  const byWallet = new Map(walletRows.map((r) => [key(r.userId, r.currency), r]));
  // Any wallet of a user is enough to name them, even if the exact leg's wallet
  // has since been closed.
  const byUser = new Map(walletRows.map((r) => [r.userId, r]));
  const savedName = new Map(contactRows.map((r) => [r.contactUserId, r.displayName]));

  return wanted.map((w) => {
    if (w.direction === "self") return { direction: "self" as const, counterparty: null };
    const wallet = byWallet.get(key(w.userId, w.currency)) ?? byUser.get(w.userId);
    if (wallet === undefined) return { direction: w.direction, counterparty: null };
    return {
      direction: w.direction,
      counterparty: {
        displayName: savedName.get(w.userId) ?? wallet.fullName,
        walletAddress: wallet.address,
        countryCode: wallet.countryCode,
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
