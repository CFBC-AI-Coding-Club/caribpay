import { eq, inArray, sql } from "drizzle-orm";
import type { Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { ledgerEntries, systemAccounts } from "../db/schema";

export class LedgerValidationError extends Error {}
export class UnbalancedLedgerError extends Error {}

/**
 * A posting against a clearing account. There is only one kind: with no customer
 * balances in this database, every entry is a system-account entry.
 */
export interface LedgerEntryInput {
  systemAccountId: string;
  direction: "debit" | "credit";
  amountMinor: number;
  currency: Currency;
}

/**
 * Append a balanced set of entries for one transaction.
 *
 * Must be called inside the same DB transaction as the status change it belongs
 * to. Positions are always derived from the entries and never stored, so the
 * only thing this has to protect is the invariant: per transaction per currency,
 * sum(debits) = sum(credits).
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

  await dbh.insert(ledgerEntries).values(
    entries.map((entry) => ({
      transactionId,
      systemAccountId: entry.systemAccountId,
      direction: entry.direction,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
    })),
  );
}

async function assertAccountCurrenciesMatch(
  dbh: DbHandle,
  entries: LedgerEntryInput[],
): Promise<void> {
  const ids = [...new Set(entries.map((e) => e.systemAccountId))];
  const rows = await dbh
    .select({ id: systemAccounts.id, currency: systemAccounts.currency })
    .from(systemAccounts)
    .where(inArray(systemAccounts.id, ids));
  const currencyByAccount = new Map(rows.map((r) => [r.id, r.currency]));

  for (const entry of entries) {
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

/**
 * A clearing account's position, derived from the entries. Positive means the
 * account has been credited more than debited.
 */
export async function accountPosition(dbh: DbHandle, systemAccountId: string): Promise<number> {
  const [row] = await dbh
    .select({
      net: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.direction} = 'credit' THEN ${ledgerEntries.amountMinor} ELSE -${ledgerEntries.amountMinor} END), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.systemAccountId, systemAccountId));
  return Number(row?.net ?? 0);
}
