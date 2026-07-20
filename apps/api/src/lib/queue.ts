import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env";

export const SETTLEMENT_QUEUE = "settlement";

// Isolate test runs from dev data living in the same redis instance.
export const queuePrefix = process.env.NODE_ENV === "test" ? "bull-test" : "bull";

/** BullMQ requires its own connections with maxRetriesPerRequest disabled. */
export function newQueueConnection(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

export interface SettlementJob {
  transactionId: string;
}

export const settlementQueue = new Queue<SettlementJob>(SETTLEMENT_QUEUE, {
  connection: newQueueConnection(),
  prefix: queuePrefix,
});

export async function enqueueSettlement(transactionId: string): Promise<void> {
  await settlementQueue.add(
    "settle",
    { transactionId },
    { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
  );
}

export async function closeQueue(): Promise<void> {
  await settlementQueue.close();
}
