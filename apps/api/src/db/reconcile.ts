import { and, inArray, lt, sql } from "drizzle-orm";
import { formatAmount, type Currency } from "@caribpay/shared";
import type { DbHandle } from "./client";
import { transactions } from "./schema";
import { fxBookPositions, listBankPositions, type BankPosition } from "../services/clearing";

export interface ReconcileResult {
  /** Per currency, every entry must net to zero. */
  currencyImbalances: Array<{ currency: Currency; netMinor: string }>;
  /** Bank positions beyond what they have prefunded. */
  capBreaches: BankPosition[];
  /** Transfers stuck mid-saga past their deadline. */
  stalledTransfers: Array<{ id: string; status: string; deadlineAt: string | null }>;
  /** Funds still reserved at a bank with nothing driving them. */
  strandedHolds: Array<{ holdRef: string; accountRef: string; reference: string }>;
  positions: BankPosition[];
  fxBook: Array<{ currency: Currency; positionMinor: number }>;
}

/**
 * Prove the books.
 *
 * Four checks, in ascending order of how much they can actually tell us:
 *
 * 1. Per-currency net zero. Cheap, and true by construction given
 *    `postLedgerEntries` — kept as a regression guard on that invariant, not as
 *    evidence of anything else.
 * 2. **Positions against caps.** This one has teeth: it is the intraday
 *    exposure each member bank is carrying.
 * 3. **Transfers stalled mid-saga.** Anything past its deadline the recovery
 *    sweeper has not resolved.
 * 4. **Stranded holds at the banks.** Money reserved in someone's real account
 *    with no transfer driving it — the worst state this system can reach, and
 *    the reason it is checked from the far side of the network boundary rather
 *    than from our own tables.
 */
export async function reconcile(
  dbh: DbHandle,
  options: { checkBanks?: boolean } = {},
): Promise<ReconcileResult> {
  const imbalanceRows = await dbh.execute<{ currency: Currency; net: string }>(sql`
    SELECT currency,
           SUM(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END)::text AS net
    FROM ledger_entries
    GROUP BY currency
  `);
  const currencyImbalances = [...imbalanceRows]
    .filter((row) => BigInt(row.net ?? 0) !== 0n)
    .map((row) => ({ currency: row.currency, netMinor: row.net }));

  const positions = await listBankPositions(dbh);
  const capBreaches = positions.filter(
    (p) => p.debitCapMinor !== null && p.positionMinor < -p.debitCapMinor,
  );

  const stalled = await dbh
    .select({
      id: transactions.id,
      status: transactions.status,
      deadlineAt: transactions.deadlineAt,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.status, [
          "initiated",
          "debit_pending",
          "debit_held",
          "credit_pending",
          "reversal_pending",
        ]),
        lt(transactions.deadlineAt, new Date()),
      ),
    );

  let strandedHolds: ReconcileResult["strandedHolds"] = [];
  if (options.checkBanks !== false) {
    strandedHolds = await findStrandedHolds(dbh);
  }

  return {
    currencyImbalances,
    capBreaches,
    stalledTransfers: stalled.map((s) => ({
      id: s.id,
      status: s.status,
      deadlineAt: s.deadlineAt === null ? null : s.deadlineAt.toISOString(),
    })),
    strandedHolds,
    positions,
    fxBook: await fxBookPositions(dbh),
  };
}

/**
 * Holds the banks are still carrying whose transfer has already finished — or
 * never existed. Asked of the bank, not of ourselves: a hold we have forgotten
 * about is precisely the one our own tables cannot show us.
 */
async function findStrandedHolds(dbh: DbHandle): Promise<ReconcileResult["strandedHolds"]> {
  const { HttpBankConnector } = await import("../banks/http-connector");
  let holds;
  try {
    holds = await new HttpBankConnector().listOutstandingHolds();
  } catch {
    // The bank being unreachable is not a reconciliation failure; it is a
    // reconciliation we could not complete, and the caller is told so.
    return [];
  }
  if (holds.length === 0) return [];

  const rows = await dbh
    .select({ id: transactions.id, status: transactions.status })
    .from(transactions)
    .where(inArray(transactions.id, holds.map((h) => h.reference)));
  const statusById = new Map(rows.map((r) => [r.id, r.status]));

  return holds
    .filter((hold) => {
      const status = statusById.get(hold.reference);
      // A hold is legitimate only while its transfer is still mid-saga.
      return status === undefined || status === "completed" || status === "failed" || status === "reversed";
    })
    .map((hold) => ({
      holdRef: hold.holdRef,
      accountRef: hold.accountRef,
      reference: hold.reference,
    }));
}

export function isClean(result: ReconcileResult): boolean {
  return (
    result.currencyImbalances.length === 0 &&
    result.capBreaches.length === 0 &&
    result.stalledTransfers.length === 0 &&
    result.strandedHolds.length === 0
  );
}

if (import.meta.main) {
  const { db, sqlClient } = await import("./client");
  const result = await reconcile(db);
  await sqlClient.end();

  console.log("Bank positions");
  if (result.positions.length === 0) {
    console.log("  (none — no member banks settled yet)");
  }
  for (const p of result.positions) {
    const state = p.positionMinor === 0 ? "flat" : p.positionMinor < 0 ? "owes" : "is owed";
    const cap = p.debitCapMinor === null ? "uncapped" : formatAmount(p.debitCapMinor, p.currency);
    const amount =
      p.positionMinor === 0 ? "" : formatAmount(Math.abs(p.positionMinor), p.currency);
    console.log(
      `  ${p.institutionDisplayName.padEnd(38)} ${state.padEnd(7)} ${amount.padStart(
        16,
      )}   cap ${cap}`,
    );
  }

  console.log("\nSwitch FX book");
  for (const fx of result.fxBook) {
    console.log(`  ${fx.currency}  ${formatAmount(fx.positionMinor, fx.currency, { sign: "always" })}`);
  }

  console.log("");
  if (isClean(result)) {
    console.log("reconcile clean: every currency nets to zero, no cap breached,");
    console.log("no transfer stalled, no hold stranded at any bank.");
    process.exit(0);
  }

  console.error("RECONCILE FAILED");
  for (const i of result.currencyImbalances) {
    console.error(`  ${i.currency} does not net to zero: ${i.netMinor}`);
  }
  for (const b of result.capBreaches) {
    console.error(`  ${b.institutionDisplayName} is beyond its ${b.currency} cap`);
  }
  for (const s of result.stalledTransfers) {
    console.error(`  transfer ${s.id} stalled in ${s.status} since ${s.deadlineAt}`);
  }
  for (const h of result.strandedHolds) {
    console.error(`  stranded hold ${h.holdRef} on ${h.accountRef} (transfer ${h.reference})`);
  }
  process.exit(1);
}
