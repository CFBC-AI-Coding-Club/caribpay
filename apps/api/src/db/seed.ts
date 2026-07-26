import { and, eq, isNull } from "drizzle-orm";
import {
  INSTITUTION_SEEDS,
  SUPPORTED_CURRENCIES,
  toMinor,
  type Currency,
} from "@caribpay/shared";
import type { DbHandle } from "./client";
import { fxRates, institutions, ledgerEntries, systemAccounts, transactions } from "./schema";
import { postLedgerEntries } from "../services/ledger";

const GLOBAL_ACCOUNT_TYPES = ["fx_liquidity", "settlement_clearing", "fee_revenue"] as const;

// Static anchors: units of each currency per 1 USD. XCD and BBD are USD-pegged.
const USD_ANCHORS: Record<Currency, number> = {
  USD: 1,
  XCD: 2.7,
  BBD: 2.0,
  JMD: 158.0,
  TTD: 6.79,
};

/**
 * How far a member bank may go into debit before the switch declines.
 *
 * This is the prefunded cap: the honest answer to who carries the risk between
 * an instant credit and a netted settlement. Sized in USD and converted, so a
 * JMD cap is not accidentally a hundredth of an XCD one.
 */
const DEBIT_CAP_USD = 250_000;

function capFor(currency: Currency): number {
  return toMinor(String(DEBIT_CAP_USD * USD_ANCHORS[currency]), currency);
}

/**
 * The switch's opening FX book.
 *
 * Sized so demo transfers read as small against it: an exposure line that looks
 * like unbounded accumulation invites a worse question than one that looks like
 * a managed position.
 */
const FX_OPENING_USD = 2_000_000;

export async function seedInstitutions(dbh: DbHandle): Promise<number> {
  const rows = INSTITUTION_SEEDS.map((seed, index) => ({
    legalName: seed.legalName,
    displayName: seed.displayName,
    countryCode: seed.countryCode,
    currency: seed.currency,
    pspHandle: seed.pspHandle,
    pspStatus: seed.pspStatus,
    supportsAccountLinking: seed.supportsAccountLinking,
    isSimulated: true,
    reservedAliases: [...seed.reservedAliases],
    sortOrder: index,
  }));
  await dbh.insert(institutions).values(rows).onConflictDoNothing();
  return rows.length;
}

/**
 * One position account per member bank per currency, plus the network-level
 * accounts. A bank gets a position only in the currency it actually settles in.
 */
export async function seedSystemAccounts(dbh: DbHandle): Promise<void> {
  const globals = GLOBAL_ACCOUNT_TYPES.flatMap((type) =>
    SUPPORTED_CURRENCIES.map((currency) => ({ type, currency, institutionId: null })),
  );
  await dbh.insert(systemAccounts).values(globals).onConflictDoNothing();

  const banks = await dbh
    .select({ id: institutions.id, currency: institutions.currency })
    .from(institutions)
    .where(eq(institutions.supportsAccountLinking, true));
  if (banks.length === 0) return;

  await dbh
    .insert(systemAccounts)
    .values(
      banks.map((bank) => ({
        type: "bank_position" as const,
        currency: bank.currency,
        institutionId: bank.id,
        debitCapMinor: capFor(bank.currency),
      })),
    )
    .onConflictDoNothing();
}

/** Inserts a fresh rate row for every ordered currency pair, crosses derived via USD. */
export async function seedFxRates(dbh: DbHandle): Promise<void> {
  const validFrom = new Date();
  const rows = [];
  for (const base of SUPPORTED_CURRENCIES) {
    for (const quote of SUPPORTED_CURRENCIES) {
      if (base === quote) continue;
      const rate = (USD_ANCHORS[quote] / USD_ANCHORS[base]).toFixed(8);
      rows.push({ baseCurrency: base, quoteCurrency: quote, rate, validFrom });
    }
  }
  await dbh.insert(fxRates).values(rows);
}

/**
 * Capitalise the FX book.
 *
 * A cross-currency transfer debits `fx_liquidity` in the destination currency,
 * so the book needs an opening position to draw on. Posted as a balanced entry
 * against `settlement_clearing`, which stands in for the switch's paid-in
 * capital — every currency still nets to zero, and the book's exposure is a
 * number `bun run settle` reports rather than a silent accumulation.
 */
export async function seedFxOpeningPosition(dbh: DbHandle): Promise<void> {
  const [existing] = await dbh
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.idempotencyKey, "seed:fx-opening"));
  if (existing !== undefined) return;

  const [tx] = await dbh
    .insert(transactions)
    .values({
      type: "fx_conversion",
      status: "completed",
      idempotencyKey: "seed:fx-opening",
      sourceCurrency: "USD",
      destCurrency: "USD",
      sourceAmountMinor: 0,
      destAmountMinor: 0,
      settledAt: new Date(),
    })
    .returning({ id: transactions.id });

  for (const currency of SUPPORTED_CURRENCIES) {
    const amountMinor = toMinor(String(FX_OPENING_USD * USD_ANCHORS[currency]), currency);
    const [fx] = await dbh
      .select({ id: systemAccounts.id })
      .from(systemAccounts)
      .where(
        and(
          eq(systemAccounts.type, "fx_liquidity"),
          eq(systemAccounts.currency, currency),
          isNull(systemAccounts.institutionId),
        ),
      );
    const [clearing] = await dbh
      .select({ id: systemAccounts.id })
      .from(systemAccounts)
      .where(
        and(
          eq(systemAccounts.type, "settlement_clearing"),
          eq(systemAccounts.currency, currency),
          isNull(systemAccounts.institutionId),
        ),
      );
    if (fx === undefined || clearing === undefined) continue;

    await postLedgerEntries(dbh, tx!.id, [
      { systemAccountId: fx.id, direction: "credit", amountMinor, currency },
      { systemAccountId: clearing.id, direction: "debit", amountMinor, currency },
    ]);
  }
}

if (import.meta.main) {
  const { db, sqlClient } = await import("./client");
  const count = await seedInstitutions(db);
  await seedSystemAccounts(db);
  const [anyRate] = await db.select({ id: fxRates.id }).from(fxRates).limit(1);
  if (anyRate === undefined) await seedFxRates(db);
  const [anyEntry] = await db.select({ id: ledgerEntries.id }).from(ledgerEntries).limit(1);
  if (anyEntry === undefined) await seedFxOpeningPosition(db);
  console.log(`seeded ${count} institutions, clearing accounts, fx rates and the fx book`);
  await sqlClient.end();
  process.exit(0);
}
