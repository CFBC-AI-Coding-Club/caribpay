import { sql } from "drizzle-orm";
import type { DbHandle } from "./client";

export interface ReconcileMismatch {
  walletId: string;
  derivedMinor: string;
  cachedMinor: string;
}

export interface ReconcileResult {
  walletsChecked: number;
  mismatches: ReconcileMismatch[];
}

/**
 * Recompute every wallet balance from ledger_entries and diff against the
 * wallet_balances cache. Sums come back from Postgres as strings; compare as
 * BigInt so nothing is ever coerced through a float.
 */
export async function reconcile(dbh: DbHandle): Promise<ReconcileResult> {
  const rows = await dbh.execute<{
    wallet_id: string;
    derived: string | null;
    cached: string | null;
  }>(sql`
    SELECT
      COALESCE(derived.wallet_id, cache.wallet_id) AS wallet_id,
      derived.total AS derived,
      cache.balance_minor::text AS cached
    FROM (
      SELECT
        wallet_id,
        SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END)::text AS total
      FROM ledger_entries
      WHERE wallet_id IS NOT NULL
      GROUP BY wallet_id
    ) derived
    FULL OUTER JOIN wallet_balances cache ON cache.wallet_id = derived.wallet_id
  `);

  const mismatches: ReconcileMismatch[] = [];
  for (const row of rows) {
    const derived = BigInt(row.derived ?? 0);
    const cached = BigInt(row.cached ?? 0);
    if (derived !== cached) {
      mismatches.push({
        walletId: row.wallet_id,
        derivedMinor: derived.toString(),
        cachedMinor: cached.toString(),
      });
    }
  }
  return { walletsChecked: rows.length, mismatches };
}

if (import.meta.main) {
  const { db, sqlClient } = await import("./client");
  const result = await reconcile(db);
  await sqlClient.end();
  if (result.mismatches.length > 0) {
    console.error(`RECONCILE FAILED: ${result.mismatches.length} mismatch(es)`);
    for (const m of result.mismatches) {
      console.error(`  wallet ${m.walletId}: ledger says ${m.derivedMinor}, cache says ${m.cachedMinor}`);
    }
    process.exit(1);
  }
  console.log(`reconcile clean: ${result.walletsChecked} wallet(s) match the ledger`);
  process.exit(0);
}
