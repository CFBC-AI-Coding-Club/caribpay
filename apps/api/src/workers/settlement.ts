import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { transactions } from "../db/schema";
import { SETTLEMENT_QUEUE, newQueueConnection, queuePrefix, type SettlementJob } from "../lib/queue";
import { mockCapssFromEnv } from "../settlement/mock-capss";
import type { SettlementProvider } from "../settlement/provider";
import { finalizeFailed, finalizeSettled } from "../services/transfers";

const POLL_INTERVAL_MS = 250;
const POLL_DEADLINE_MS = 60_000;

export function createSettlementWorker(
  provider: SettlementProvider = mockCapssFromEnv(),
): Worker<SettlementJob> {
  return new Worker<SettlementJob>(
    SETTLEMENT_QUEUE,
    async (job) => {
      const { transactionId } = job.data;
      const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
      if (row === undefined || row.status !== "pending_settlement") {
        return; // already finalized or unknown (e.g. stale job) — nothing to do
      }

      const { providerRef } = await provider.submit({
        transactionId,
        sourceCurrency: row.sourceCurrency,
        destCurrency: row.destCurrency,
        sourceAmountMinor: row.sourceAmountMinor,
        destAmountMinor: row.destAmountMinor,
      });

      const deadline = Date.now() + POLL_DEADLINE_MS;
      let status: "pending" | "settled" | "failed" = "pending";
      while (status === "pending") {
        if (Date.now() > deadline) {
          throw new Error(`Settlement polling timed out for ${transactionId}`);
        }
        await Bun.sleep(POLL_INTERVAL_MS);
        status = await provider.poll(providerRef);
      }

      if (status === "settled") {
        await finalizeSettled(db, transactionId);
      } else {
        await finalizeFailed(db, transactionId, "CAPSS settlement failed");
      }
    },
    { connection: newQueueConnection(), prefix: queuePrefix, concurrency: 5 },
  );
}
