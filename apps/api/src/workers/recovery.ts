import { db } from "../db/client";
import { driveTransfer, findStalledTransfers } from "../services/transfers";

const SWEEP_INTERVAL_MS = 5_000;

/**
 * Finish what the workers could not.
 *
 * A transfer can stop mid-saga for reasons no retry policy covers: the process
 * died between crediting the payee and posting the ledger, the queue lost the
 * job, someone closed the laptop. Past the credit the money has irrevocably
 * reached the payee, so recovery always drives **forward** — it re-asks the
 * banks what happened and finishes, rather than trying to undo something that
 * cannot be undone.
 *
 * This is also why a hold can never strand: `reversal_pending` is swept here
 * until the release succeeds, and the bank expires the hold on its own regardless.
 */
export async function sweepStalledTransfers(): Promise<number> {
  const ids = await findStalledTransfers(db);
  let recovered = 0;
  for (const id of ids) {
    try {
      await driveTransfer(db, id);
      recovered += 1;
    } catch (error) {
      // Still unresolved — the bank is down or slow. Left for the next sweep;
      // never dead-lettered, because someone's money is reserved.
      console.error(`[recovery] transfer ${id} still unresolved:`, error);
    }
  }
  return recovered;
}

export function startRecoverySweeper(intervalMs = SWEEP_INTERVAL_MS): { stop: () => void } {
  const timer = setInterval(() => {
    void sweepStalledTransfers();
  }, intervalMs);
  // Do not hold the process open on this alone.
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
