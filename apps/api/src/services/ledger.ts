import { eq, inArray, sql } from "drizzle-orm";
import type { Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { ledgerEntries, systemAccounts, walletBalances, wallets } from "../db/schema";

export class LedgerValidationError extends Error {}
export class UnbalancedLedgerError extends Error {}
export class InsufficientBalanceError extends Error {}

export type LedgerEntryInput = {
  direction: "debit" | "credit";
  amountMinor: number;
  currency: Currency;
} & (
  | { accountType: "user_wallet"; walletId: string }
  | { accountType: "system"; systemAccountId: string }
);

function isNonNegativeBalanceViolation(error: unknown): boolean {
  // Structural check (Bun.sql's PostgresError carries `constraint`), walking
  // the cause chain because drizzle wraps driver errors.
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as { constraint?: unknown }).constraint === "wallet_balances_non_negative") {
      return true;
    }
  }
  return false;
}

/**
 * Append a balanced set of entries for one transaction and update the balance
 * cache atomically. Must be called inside the same DB transaction as the
 * business-level status changes it belongs to.
 */
export async function postLedgerEntries(
  dbh: DbHandle,
  transactionId: string,
  entries: LedgerEntryInput[],
): Promise<void> {
  if (entries.length === 0) {
    throw new LedgerValidationError("A ledger posting needs at least one entry");
  }
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0) {
      throw new LedgerValidationError(
        `Entry amounts must be positive integers, got ${entry.amountMinor}`,
      );
    }
  }

  const netByCurrency = new Map<Currency, number>();
  for (const entry of entries) {
    const signed = entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor;
    netByCurrency.set(entry.currency, (netByCurrency.get(entry.currency) ?? 0) + signed);
  }
  for (const [currency, net] of netByCurrency) {
    if (net !== 0) {
      throw new UnbalancedLedgerError(
        `Debits and credits for ${currency} do not balance (net ${net})`,
      );
    }
  }

  await assertAccountCurrenciesMatch(dbh, entries);

  const inserted = await dbh
    .insert(ledgerEntries)
    .values(
      entries.map((entry) => ({
        transactionId,
        accountType: entry.accountType,
        walletId: entry.accountType === "user_wallet" ? entry.walletId : null,
        systemAccountId: entry.accountType === "system" ? entry.systemAccountId : null,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
      })),
    )
    .returning({ createdAt: ledgerEntries.createdAt });
  const asOf = inserted[0]?.createdAt ?? new Date();

  const deltaByWallet = new Map<string, number>();
  for (const entry of entries) {
    if (entry.accountType !== "user_wallet") continue;
    const signed = entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor;
    deltaByWallet.set(entry.walletId, (deltaByWallet.get(entry.walletId) ?? 0) + signed);
  }
  for (const [walletId, delta] of deltaByWallet) {
    try {
      // Update-first: an INSERT tuple carrying a negative delta would trip the
      // non-negative CHECK before ON CONFLICT could route it to the update.
      const updated = await dbh
        .update(walletBalances)
        .set({
          balanceMinor: sql`${walletBalances.balanceMinor} + ${delta}`,
          asOfEntryCreatedAt: asOf,
        })
        .where(eq(walletBalances.walletId, walletId))
        .returning({ walletId: walletBalances.walletId });
      if (updated.length === 0) {
        const inserted = await dbh
          .insert(walletBalances)
          .values({ walletId, balanceMinor: delta, asOfEntryCreatedAt: asOf })
          .onConflictDoNothing()
          .returning({ walletId: walletBalances.walletId });
        if (inserted.length === 0) {
          // Lost a first-posting race; the row exists now, so the update applies.
          await dbh
            .update(walletBalances)
            .set({
              balanceMinor: sql`${walletBalances.balanceMinor} + ${delta}`,
              asOfEntryCreatedAt: asOf,
            })
            .where(eq(walletBalances.walletId, walletId));
        }
      }
    } catch (error) {
      if (isNonNegativeBalanceViolation(error)) {
        throw new InsufficientBalanceError(
          `Posting would overdraw wallet ${walletId} (delta ${delta})`,
        );
      }
      throw error;
    }
  }
}

async function assertAccountCurrenciesMatch(
  dbh: DbHandle,
  entries: LedgerEntryInput[],
): Promise<void> {
  const walletIds = [
    ...new Set(entries.flatMap((e) => (e.accountType === "user_wallet" ? [e.walletId] : []))),
  ];
  if (walletIds.length > 0) {
    const rows = await dbh
      .select({ id: wallets.id, currency: wallets.currency })
      .from(wallets)
      .where(inArray(wallets.id, walletIds));
    const currencyByWallet = new Map(rows.map((r) => [r.id, r.currency]));
    for (const entry of entries) {
      if (entry.accountType !== "user_wallet") continue;
      const walletCurrency = currencyByWallet.get(entry.walletId);
      if (walletCurrency === undefined) {
        throw new LedgerValidationError(`Wallet ${entry.walletId} does not exist`);
      }
      if (walletCurrency !== entry.currency) {
        throw new LedgerValidationError(
          `Wallet ${entry.walletId} is ${walletCurrency}, entry is ${entry.currency}`,
        );
      }
    }
  }

  const systemAccountIds = [
    ...new Set(entries.flatMap((e) => (e.accountType === "system" ? [e.systemAccountId] : []))),
  ];
  if (systemAccountIds.length > 0) {
    const rows = await dbh
      .select({ id: systemAccounts.id, currency: systemAccounts.currency })
      .from(systemAccounts)
      .where(inArray(systemAccounts.id, systemAccountIds));
    const currencyByAccount = new Map(rows.map((r) => [r.id, r.currency]));
    for (const entry of entries) {
      if (entry.accountType !== "system") continue;
      const accountCurrency = currencyByAccount.get(entry.systemAccountId);
      if (accountCurrency === undefined) {
        throw new LedgerValidationError(`System account ${entry.systemAccountId} does not exist`);
      }
      if (accountCurrency !== entry.currency) {
        throw new LedgerValidationError(
          `System account ${entry.systemAccountId} is ${accountCurrency}, entry is ${entry.currency}`,
        );
      }
    }
  }
}

/** Cached balance from wallet_balances; 0 if the wallet has never had an entry. */
export async function getBalance(dbh: DbHandle, walletId: string): Promise<number> {
  const [row] = await dbh
    .select({ balanceMinor: walletBalances.balanceMinor })
    .from(walletBalances)
    .where(eq(walletBalances.walletId, walletId));
  return row?.balanceMinor ?? 0;
}

/**
 * Locks the wallet's balance row (FOR UPDATE) and throws if it cannot cover
 * amountMinor. Call inside the transaction that will post the debit.
 */
export async function assertSufficientBalance(
  dbh: DbHandle,
  walletId: string,
  amountMinor: number,
): Promise<void> {
  const [row] = await dbh
    .select({ balanceMinor: walletBalances.balanceMinor })
    .from(walletBalances)
    .where(eq(walletBalances.walletId, walletId))
    .for("update");
  const balance = row?.balanceMinor ?? 0;
  if (balance < amountMinor) {
    throw new InsufficientBalanceError(
      `Wallet ${walletId} holds ${balance} minor units, needs ${amountMinor}`,
    );
  }
}
