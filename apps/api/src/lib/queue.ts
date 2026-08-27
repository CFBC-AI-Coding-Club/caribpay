import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env";

export const TRANSFER_QUEUE = "transfer";

// Isolate test runs from dev data living in the same redis instance.
export const queuePrefix = process.env.NODE_ENV === "test" ? "bull-test" : "bull";

/** BullMQ requires its own connections with maxRetriesPerRequest disabled. */
export function newQueueConnection(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

export interface TransferJob {
  transactionId: string;
}

export const transferQueue = new Queue<TransferJob>(TRANSFER_QUEUE, {
  connection: newQueueConnection(),
  prefix: queuePrefix,
});

/**
 * Drive a transfer's saga.
 *
 * Retries are generous and backed off: every step is keyed on the transaction
 * id, so a retry replays the bank's original answer rather than repeating the
 * instruction. Exhausting them is not a loss — the recovery sweeper picks the
 * transfer up from whatever state it reached.
 */
export async function enqueueTransfer(transactionId: string): Promise<void> {
  await transferQueue.add(
    "drive",
    { transactionId },
    { jobId: transactionId, attempts: 8, backoff: { type: "exponential", delay: 500 } },
  );
}

export async function closeQueue(): Promise<void> {
  await transferQueue.close();
}
