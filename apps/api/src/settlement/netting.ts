import { and, eq, gte, sql } from "drizzle-orm";
import { formatAmount, type Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import {
  settlementCycleEntries,
  settlementCycles,
  systemAccounts,
  transactions,
} from "../db/schema";
import { globalAccountId, listBankPositions } from "../services/clearing";
import { postLedgerEntries, type LedgerEntryInput } from "../services/ledger";

export interface CyclePosition {
  institutionId: string;
  institutionDisplayName: string;
  currency: Currency;
  netPositionMinor: number;
}

export interface SettlementCycleResult {
  cycleId: string;
  transferCount: number;
  positions: CyclePosition[];
  /** Gross value moved in the window, per currency. */
  gross: Array<{ currency: Currency; grossMinor: number }>;
  settled: boolean;
}

/**
 * Net every member bank's position down to zero.
 *
 * The credit to a payee was instant and irrevocable; settlement between the
 * banks is deferred and netted, which is how UPI and PAPSS both work and is the
 * whole economic argument for a switch. Forty-seven transfers between two
 * islands become one instruction.
 *
 * Positions are settled against `settlement_clearing`, so the ledger stays
 * balanced per currency and the cycle is auditable as its own transaction.
 */
export async function runSettlementCycle(dbh: DbHandle): Promise<SettlementCycleResult> {
  const positions = await listBankPositions(dbh);
  const open = positions.filter((p) => p.positionMinor !== 0);

  const [lastCycle] = await dbh
    .select({ completedAt: settlementCycles.completedAt })
    .from(settlementCycles)
    .orderBy(sql`${settlementCycles.startedAt} DESC`)
    .limit(1);
  const since = lastCycle?.completedAt ?? new Date(0);

  const windowTransfers = await dbh
    .select({
      id: transactions.id,
      sourceCurrency: transactions.sourceCurrency,
      sourceAmountMinor: transactions.sourceAmountMinor,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.status, "completed"),
        eq(transactions.type, "p2p_transfer"),
        gte(transactions.settledAt, since),
      ),
    );

  const grossByCurrency = new Map<Currency, number>();
  for (const t of windowTransfers) {
    grossByCurrency.set(
      t.sourceCurrency,
      (grossByCurrency.get(t.sourceCurrency) ?? 0) + t.sourceAmountMinor,
    );
  }

  const [cycle] = await dbh
    .insert(settlementCycles)
    .values({ transferCount: windowTransfers.length })
    .returning();

  if (open.length === 0) {
    await dbh
      .update(settlementCycles)
      .set({ completedAt: new Date() })
      .where(eq(settlementCycles.id, cycle!.id));
    return {
      cycleId: cycle!.id,
      transferCount: windowTransfers.length,
      positions: [],
      gross: [...grossByCurrency].map(([currency, grossMinor]) => ({ currency, grossMinor })),
      settled: false,
    };
  }

  await dbh.transaction(async (tx) => {
    const [clearingTx] = await tx
      .insert(transactions)
      .values({
        type: "fx_conversion",
        status: "completed",
        idempotencyKey: `settlement:${cycle!.id}`,
        sourceCurrency: open[0]!.currency,
        destCurrency: open[0]!.currency,
        sourceAmountMinor: 0,
        destAmountMinor: 0,
        settledAt: new Date(),
      })
      .returning({ id: transactions.id });

    // One balanced posting per currency: each bank's position moves to zero and
    // the contra lands on settlement_clearing.
    const byCurrency = new Map<Currency, typeof open>();
    for (const p of open) {
      const list = byCurrency.get(p.currency) ?? [];
      list.push(p);
      byCurrency.set(p.currency, list);
    }

    for (const [currency, banks] of byCurrency) {
      const clearing = await globalAccountId(tx, "settlement_clearing", currency);
      const entries: LedgerEntryInput[] = [];
      // Signed effect of the bank entries, in position terms (credit raises a
      // position, debit lowers it). The contra has to cancel exactly this.
      let bankNet = 0;

      for (const bank of banks) {
        const accountId = await bankPositionAccount(tx, bank.institutionId, currency);
        const amount = Math.abs(bank.positionMinor);
        const owes = bank.positionMinor < 0;
        entries.push({
          systemAccountId: accountId,
          // A bank that owes (negative) is credited back to zero, and vice versa.
          direction: owes ? "credit" : "debit",
          amountMinor: amount,
          currency,
        });
        bankNet += owes ? amount : -amount;
      }

      if (bankNet !== 0) {
        entries.push({
          systemAccountId: clearing,
          // Opposite side to the banks: credits there are debits here.
          direction: bankNet > 0 ? "debit" : "credit",
          amountMinor: Math.abs(bankNet),
          currency,
        });
      }
      await postLedgerEntries(tx, clearingTx!.id, entries);
    }

    await tx.insert(settlementCycleEntries).values(
      open.map((p) => ({
        cycleId: cycle!.id,
        institutionId: p.institutionId,
        currency: p.currency,
        netPositionMinor: p.positionMinor,
      })),
    );

    await tx
      .update(settlementCycles)
      .set({ completedAt: new Date(), transactionId: clearingTx!.id })
      .where(eq(settlementCycles.id, cycle!.id));
  });

  return {
    cycleId: cycle!.id,
    transferCount: windowTransfers.length,
    positions: open.map((p) => ({
      institutionId: p.institutionId,
      institutionDisplayName: p.institutionDisplayName,
      currency: p.currency,
      netPositionMinor: p.positionMinor,
    })),
    gross: [...grossByCurrency].map(([currency, grossMinor]) => ({ currency, grossMinor })),
    settled: true,
  };
}

async function bankPositionAccount(
  dbh: DbHandle,
  institutionId: string,
  currency: Currency,
): Promise<string> {
  const [row] = await dbh
    .select({ id: systemAccounts.id })
    .from(systemAccounts)
    .where(
      and(
        eq(systemAccounts.type, "bank_position"),
        eq(systemAccounts.currency, currency),
        eq(systemAccounts.institutionId, institutionId),
      ),
    );
  if (row === undefined) {
    throw new Error(`No bank_position account for ${institutionId} in ${currency}`);
  }
  return row.id;
}

if (import.meta.main) {
  const { db, sqlClient } = await import("../db/client");
  const result = await runSettlementCycle(db);

  const date = new Date().toISOString().slice(0, 10);
  const banks = [...new Set(result.positions.map((p) => p.institutionDisplayName))];
  console.log(`Cycle ${date}${banks.length > 0 ? ` · ${banks.join(" ↔ ")}` : ""}`);

  const grossLine = result.gross
    .map((g) => formatAmount(g.grossMinor, g.currency))
    .join(" / ");
  console.log(
    `  ${result.transferCount} transfer${result.transferCount === 1 ? "" : "s"}` +
      (grossLine === "" ? "" : `   gross ${grossLine}`),
  );

  if (!result.settled) {
    console.log("  NET: every position already flat — nothing to settle.");
  } else {
    for (const p of result.positions) {
      const verb = p.netPositionMinor < 0 ? "owes the network " : "is owed by network";
      console.log(
        `  NET: ${p.institutionDisplayName.padEnd(38)} ${verb} ${formatAmount(
          Math.abs(p.netPositionMinor),
          p.currency,
        ).padStart(16)}`,
      );
    }
    const instructions = result.positions.length;
    console.log(
      `  ${instructions} settlement instruction${instructions === 1 ? "" : "s"} replace ${
        result.transferCount
      } correspondent hop${result.transferCount === 1 ? "" : "s"}.`,
    );
  }

  await sqlClient.end();
  process.exit(0);
}
