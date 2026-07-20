import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { TransactionsPage } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { transactions } from "../db/schema";
import { toPublicTransaction } from "./transfers";

// The "Regional transfers" feed is about money moving between people, so it
// excludes funding deposits/withdrawals even though the user is party to them.
const FEED_TYPES = ["p2p_transfer", "fx_conversion"] as const;

/**
 * Unified feed of every transfer the user is party to (sender or recipient),
 * newest first. Keyset-paginated on (created_at, id) so new inserts never shift
 * an in-flight page.
 */
export async function listUserTransactions(
  dbh: DbHandle,
  userId: string,
  limit: number,
  cursor?: string,
): Promise<TransactionsPage> {
  const partyCondition = or(
    eq(transactions.senderUserId, userId),
    eq(transactions.recipientUserId, userId),
  );
  const cursorCondition =
    cursor === undefined
      ? sql`TRUE`
      : sql`(${transactions.createdAt}, ${transactions.id}) < ((SELECT t2.created_at FROM transactions t2 WHERE t2.id = ${cursor}::uuid), ${cursor}::uuid)`;

  const rows = await dbh
    .select()
    .from(transactions)
    .where(and(inArray(transactions.type, FEED_TYPES), sql`(${partyCondition}) AND ${cursorCondition}`))
    .orderBy(desc(transactions.createdAt), desc(transactions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    items: page.map(toPublicTransaction),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}
