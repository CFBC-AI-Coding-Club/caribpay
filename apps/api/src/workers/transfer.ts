import { Worker } from "bullmq";
import { db } from "../db/client";
import { TRANSFER_QUEUE, newQueueConnection, queuePrefix, type TransferJob } from "../lib/queue";
import { driveTransfer } from "../services/transfers";

/**
 * Runs the transfer saga.
 *
 * The job carries only the transaction id: everything else is read from the row,
 * so a retry after a crash resumes from whatever state the transfer actually
 * reached rather than from what the job remembers.
 */
export function createTransferWorker(): Worker<TransferJob> {
  return new Worker<TransferJob>(
    TRANSFER_QUEUE,
    async (job) => {
      await driveTransfer(db, job.data.transactionId);
    },
    { connection: newQueueConnection(), prefix: queuePrefix, concurrency: 5 },
  );
}
