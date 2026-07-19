import { SUPPORTED_CURRENCIES, type Currency } from "@caribpay/shared";
import type { DbHandle } from "./client";
import { fxRates, systemAccounts } from "./schema";

const SYSTEM_ACCOUNT_TYPES = ["fx_liquidity", "settlement_clearing", "fee_revenue"] as const;

// Static anchors: units of each currency per 1 USD. XCD and BBD are USD-pegged.
const USD_ANCHORS: Record<Currency, number> = {
  USD: 1,
  XCD: 2.7,
  BBD: 2.0,
  JMD: 158.0,
  TTD: 6.79,
};

export async function seedSystemAccounts(dbh: DbHandle): Promise<void> {
  const rows = SYSTEM_ACCOUNT_TYPES.flatMap((type) =>
    SUPPORTED_CURRENCIES.map((currency) => ({ type, currency })),
  );
  await dbh.insert(systemAccounts).values(rows).onConflictDoNothing();
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

if (import.meta.main) {
  const { db, sqlClient } = await import("./client");
  await seedSystemAccounts(db);
  await seedFxRates(db);
  console.log("seeded system accounts and fx rates");
  await sqlClient.end();
  process.exit(0);
}
