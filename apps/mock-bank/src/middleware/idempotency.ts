import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db/client";
import { bankIdempotencyRecords } from "../db/schema";
import { BankError } from "../lib/errors";
import type { BankAppEnv } from "../app-env";

const RECORD_TTL_HOURS = 48;

/**
 * Replay, rather than repeat, an instruction we have already carried out.
 *
 * This is the most important middleware in the project. The switch derives its
 * keys from `${transactionId}:${step}`, so a retry after a timeout arrives here
 * with the *same* key — and must get the original answer back rather than place
 * a second hold or post a second credit.
 *
 * It is also what makes re-sending safe as a *question*: when the switch does
 * not know whether a credit landed, it sends it again. If it landed, this
 * replays the original response; if it never arrived, it executes now. Either
 * way the answer is the truth, which is why the switch needs no lookup endpoint.
 *
 * **The key is claimed before the work runs, not after.** Reading for an
 * existing record and then proceeding is a check-then-act race: concurrent
 * retries — which is exactly what a flaky connection produces — all read
 * nothing, all proceed, and all move money. Inserting first makes the primary
 * key the lock, so precisely one caller does the work and the rest replay it.
 *
 * The key travels in the header, matching the switch's own convention — the
 * confirm and release endpoints have no body to carry it in.
 */
export function bankIdempotency(): MiddlewareHandler<BankAppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined || key.length === 0 || key.length > 200) {
      throw new BankError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Every instruction needs an Idempotency-Key header",
      );
    }

    const rawBody = await c.req.text();
    const requestHash = createHash("sha256")
      .update(`${c.req.method} ${c.req.path} ${rawBody}`)
      .digest("hex");

    const claimed = await db
      .insert(bankIdempotencyRecords)
      .values({
        key,
        requestHash,
        expiresAt: new Date(Date.now() + RECORD_TTL_HOURS * 60 * 60 * 1000),
      })
      .onConflictDoNothing()
      .returning({ key: bankIdempotencyRecords.key });

    if (claimed.length === 0) {
      const [existing] = await db
        .select()
        .from(bankIdempotencyRecords)
        .where(eq(bankIdempotencyRecords.key, key));

      if (existing === undefined) {
        // Raced an expiry sweep. Unknown outcome, so the switch must re-send
        // rather than assume anything.
        throw new BankError(503, "BANK_UNAVAILABLE", "Try that instruction again");
      }
      if (existing.requestHash !== requestHash) {
        throw new BankError(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "That key was already used for a different instruction",
        );
      }
      if (existing.responseStatus === null) {
        // A copy of this instruction is executing right now. Not a refusal —
        // the switch retries, and by then there is a response to replay.
        throw new BankError(409, "INSTRUCTION_IN_FLIGHT", "That instruction is still running");
      }
      c.header("Idempotency-Replayed", "true");
      return c.json(existing.responseBody, existing.responseStatus as ContentfulStatusCode);
    }

    try {
      await next();
    } catch (error) {
      // The handler's work is transactional, so a throw means nothing moved.
      // Drop the claim rather than persisting a failure the switch would then
      // be unable to retry past.
      await db.delete(bankIdempotencyRecords).where(eq(bankIdempotencyRecords.key, key));
      throw error;
    }

    if (c.res.status >= 500) {
      await db.delete(bankIdempotencyRecords).where(eq(bankIdempotencyRecords.key, key));
      return;
    }

    const bodyText = await c.res.clone().text();
    await db
      .update(bankIdempotencyRecords)
      .set({
        responseStatus: c.res.status,
        responseBody: bodyText === "" ? null : JSON.parse(bodyText),
      })
      .where(eq(bankIdempotencyRecords.key, key));
  };
}
