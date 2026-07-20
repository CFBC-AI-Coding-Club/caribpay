import { env } from "../env";
import type { SettlementProvider, SettlementRequest } from "./provider";

export interface MockCapssOptions {
  /** Fixed delay in ms; null/undefined means a random 2-5 s like a real rail. */
  delayMs?: number | null;
  /** Probability in [0, 1] that a submission ends in failure. */
  failureRate?: number;
}

/**
 * Stand-in for the real CAPSS connection. State is in-memory, so poll() must
 * run in the same process that called submit() — true for the worker, which
 * submits and polls within one job.
 */
export class MockCapssProvider implements SettlementProvider {
  private readonly inflight = new Map<string, { settleAt: number; outcome: "settled" | "failed" }>();

  constructor(private readonly options: MockCapssOptions = {}) {}

  async submit(_tx: SettlementRequest): Promise<{ providerRef: string }> {
    const delayMs = this.options.delayMs ?? 2000 + Math.random() * 3000;
    const fails = Math.random() < (this.options.failureRate ?? 0);
    const providerRef = `CAPSS-${crypto.randomUUID()}`;
    this.inflight.set(providerRef, {
      settleAt: Date.now() + delayMs,
      outcome: fails ? "failed" : "settled",
    });
    return { providerRef };
  }

  async poll(providerRef: string): Promise<"pending" | "settled" | "failed"> {
    const entry = this.inflight.get(providerRef);
    if (entry === undefined) {
      // Unknown ref (e.g. worker restarted): stay pending; BullMQ retries the
      // job, which re-submits from scratch.
      return "pending";
    }
    if (Date.now() < entry.settleAt) {
      return "pending";
    }
    this.inflight.delete(providerRef);
    return entry.outcome;
  }
}

export function mockCapssFromEnv(): MockCapssProvider {
  return new MockCapssProvider({
    delayMs: env.mockSettlementDelayMs,
    failureRate: env.mockSettlementFailures ? 0.02 : 0,
  });
}
