import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db/client";
import { idempotencyRecords } from "../db/schema";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../app-env";

const RECORD_TTL_HOURS = 24;

/**
 * Money-moving endpoints must carry an Idempotency-Key. Completed responses are
 * persisted and replayed verbatim on duplicates.
 *
 * **The key is claimed before the handler runs.** Reading for an existing record
 * and then proceeding is a check-then-act race: concurrent copies of one request
 * — which is what a flaky mobile connection produces — all read nothing, all
 * proceed, and all move money. Inserting first makes the primary key the lock,
 * so exactly one caller does the work and the rest replay it. (The same bug in
 * the mock bank placed three holds for ten concurrent retries of one hold.)
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined || key.length === 0 || key.length > 200) {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key header");
    }
    const userId = c.get("userId");
    const rawBody = await c.req.text();
    const requestHash = createHash("sha256")
      .update(`${c.req.method} ${c.req.path} ${rawBody}`)
      .digest("hex");

    const claimed = await db
      .insert(idempotencyRecords)
      .values({
        key,
        userId,
        requestHash,
        expiresAt: new Date(Date.now() + RECORD_TTL_HOURS * 60 * 60 * 1000),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyRecords.key });

    if (claimed.length === 0) {
      const [existing] = await db
        .select()
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.key, key));

      if (existing === undefined) {
        throw new ApiError(503, "TRY_AGAIN", "Please retry that request");
      }
      if (existing.userId !== userId || existing.requestHash !== requestHash) {
        throw new ApiError(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used with a different request",
        );
      }
      if (existing.responseStatus === null) {
        throw new ApiError(409, "REQUEST_IN_FLIGHT", "That request is still being processed");
      }
      c.header("Idempotency-Replayed", "true");
      return c.json(existing.responseBody, existing.responseStatus as ContentfulStatusCode);
    }

    try {
      await next();
    } catch (error) {
      // Release the claim so the caller can retry: a request that threw did not
      // complete, and a permanently held key would block it forever.
      await db.delete(idempotencyRecords).where(eq(idempotencyRecords.key, key));
      throw error;
    }

    // Persist final outcomes only; 5xx stays retryable with the same key.
    if (c.res.status >= 500) {
      await db.delete(idempotencyRecords).where(eq(idempotencyRecords.key, key));
      return;
    }

    const bodyText = await c.res.clone().text();
    await db
      .update(idempotencyRecords)
      .set({
        responseStatus: c.res.status,
        responseBody: bodyText === "" ? null : JSON.parse(bodyText),
      })
      .where(eq(idempotencyRecords.key, key));
  };
}
