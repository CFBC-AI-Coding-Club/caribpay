import type { MiddlewareHandler } from "hono";
import { BankError } from "../lib/errors";
import { env } from "../env";
import type { BankAppEnv } from "../app-env";

/**
 * Make the bank behave like a rail rather than a function call: it takes time,
 * and it sometimes does not answer.
 *
 * Injected failures use `BANK_UNAVAILABLE`, which is deliberately *not* in
 * `BANK_REFUSAL_CODES`. A flaky rail leaves the outcome unknown, and the switch
 * must resolve that by replaying the instruction — not by assuming it failed.
 * Deterministic refusals come from real account conditions instead: a frozen
 * account, a closed one, insufficient funds.
 */
export const simulateRail: MiddlewareHandler<BankAppEnv> = async (c, next) => {
  const spread = Math.max(0, env.latencyMaxMs - env.latencyMinMs);
  const delay = env.latencyMinMs + Math.random() * spread;
  if (delay > 0) await Bun.sleep(delay);

  if (env.failureRate > 0 && c.req.method !== "GET" && Math.random() < env.failureRate) {
    throw new BankError(503, "BANK_UNAVAILABLE", "The bank did not respond");
  }

  await next();
};
