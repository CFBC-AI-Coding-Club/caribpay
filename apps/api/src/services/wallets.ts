import { desc, eq, sql } from "drizzle-orm";
import { applyRate, homeCurrencyFor, type Currency, type Wallet } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { ledgerEntries, transactions, users, walletBalances, wallets } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { getLatestRate } from "./fx";

// No 0/O/1/I/L so addresses stay unambiguous when read aloud or retyped.
const ADDRESS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateWalletAddress(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ADDRESS_ALPHABET[b % ADDRESS_ALPHABET.length]);
  const block = (start: number) => chars.slice(start, start + 4).join("");
  return `CW-${block(0)}-${block(4)}-${block(8)}-${block(12)}`;
}

export interface WalletRow {
  id: string;
  userId: string;
  currency: Currency;
  address: string;
  createdAt: Date;
}

export async function createWalletForUser(
  dbh: DbHandle,
  userId: string,
  currency: Currency,
): Promise<WalletRow> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [wallet] = await dbh
        .insert(wallets)
        .values({ userId, currency, address: generateWalletAddress() })
        .returning();
      return wallet!;
    } catch (error) {
      const addressCollision = isUniqueViolation(error, "wallets_address_unique");
      if (!addressCollision || attempt >= 2) throw error;
    }
  }
}

export async function createAdditionalWallet(
  dbh: DbHandle,
  userId: string,
  currency: Currency,
): Promise<Wallet> {
  try {
    const row = await createWalletForUser(dbh, userId, currency);
    return toPublicWallet(row, 0);
  } catch (error) {
    if (isUniqueViolation(error, "wallets_user_currency_uq")) {
      throw new ApiError(409, "WALLET_EXISTS", `You already have a ${currency} wallet`);
    }
    throw error;
  }
}

function toPublicWallet(
  row: { id: string; currency: Currency; address: string; createdAt: Date },
  balanceMinor: number,
): Wallet {
  return {
    id: row.id,
    currency: row.currency,
    address: row.address,
    balanceMinor,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWalletsWithTotal(
  dbh: DbHandle,
  userId: string,
): Promise<{ wallets: Wallet[]; totalBalance: { currency: Currency; amountMinor: number } }> {
  const [user] = await dbh.select().from(users).where(eq(users.id, userId));
  if (user === undefined) {
    throw new ApiError(401, "UNAUTHORIZED", "Account no longer exists");
  }
  const homeCurrency = homeCurrencyFor(user.countryCode);

  const rows = await dbh
    .select({
      id: wallets.id,
      currency: wallets.currency,
      address: wallets.address,
      createdAt: wallets.createdAt,
      balanceMinor: sql<string>`COALESCE(${walletBalances.balanceMinor}, 0)::text`,
    })
    .from(wallets)
    .leftJoin(walletBalances, eq(walletBalances.walletId, wallets.id))
    .where(eq(wallets.userId, userId))
    .orderBy(wallets.createdAt);

  const publicWallets: Wallet[] = [];
  let totalMinor = 0;
  for (const row of rows) {
    const balanceMinor = Number(row.balanceMinor);
    publicWallets.push(toPublicWallet(row, balanceMinor));
    const inHome =
      row.currency === homeCurrency
        ? balanceMinor
        : applyRate(balanceMinor, await getLatestRate(dbh, row.currency, homeCurrency));
    totalMinor += inHome;
  }
  if (!Number.isSafeInteger(totalMinor)) {
    throw new ApiError(500, "INTERNAL_ERROR", "Balance aggregation overflow");
  }
  return { wallets: publicWallets, totalBalance: { currency: homeCurrency, amountMinor: totalMinor } };
}

export interface WalletTransactionsPage {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
}

/**
 * Keyset-paginated transactions touching one wallet, newest first. The cursor
 * is the last row's transaction id; its created_at is resolved in SQL so
 * microsecond precision never round-trips through a JS Date.
 */
export async function walletTransactionsPage(
  dbh: DbHandle,
  userId: string,
  walletId: string,
  limit: number,
  cursor?: string,
): Promise<WalletTransactionsPage> {
  const [wallet] = await dbh
    .select({ id: wallets.id })
    .from(wallets)
    .where(sql`${eq(wallets.id, walletId)} AND ${eq(wallets.userId, userId)}`);
  if (wallet === undefined) {
    throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
  }

  const cursorCondition =
    cursor === undefined
      ? sql`TRUE`
      : sql`(${transactions.createdAt}, ${transactions.id}) < ((SELECT t2.created_at FROM transactions t2 WHERE t2.id = ${cursor}::uuid), ${cursor}::uuid)`;

  const rows = await dbh
    .select({
      id: transactions.id,
      type: transactions.type,
      status: transactions.status,
      sourceCurrency: transactions.sourceCurrency,
      destCurrency: transactions.destCurrency,
      sourceAmountMinor: transactions.sourceAmountMinor,
      destAmountMinor: transactions.destAmountMinor,
      fxRateUsed: transactions.fxRateUsed,
      senderUserId: transactions.senderUserId,
      recipientUserId: transactions.recipientUserId,
      failureReason: transactions.failureReason,
      settledAt: transactions.settledAt,
      createdAt: transactions.createdAt,
      walletDeltaMinor: sql<string>`SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE -${ledgerEntries.amountMinor} END)::text`,
    })
    .from(transactions)
    .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, transactions.id))
    .where(sql`${eq(ledgerEntries.walletId, walletId)} AND ${cursorCondition}`)
    .groupBy(transactions.id)
    .orderBy(desc(transactions.createdAt), desc(transactions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const items = page.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    sourceCurrency: row.sourceCurrency,
    destCurrency: row.destCurrency,
    sourceAmountMinor: row.sourceAmountMinor,
    destAmountMinor: row.destAmountMinor,
    fxRateUsed: row.fxRateUsed,
    senderUserId: row.senderUserId,
    recipientUserId: row.recipientUserId,
    failureReason: row.failureReason,
    settledAt: row.settledAt === null ? null : row.settledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    walletDeltaMinor: Number(row.walletDeltaMinor),
  }));
  return {
    items,
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}
