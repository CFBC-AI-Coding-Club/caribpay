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
 * Money-moving endpoints must carry an Idempotency-Key header. Completed
 * responses are persisted and replayed verbatim on duplicates; reusing a key
 * with a different payload is rejected. Must run after requireAuth.
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

    const [existing] = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, key));
    if (existing !== undefined) {
      if (existing.userId !== userId || existing.requestHash !== requestHash) {
        throw new ApiError(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used with a different request",
        );
      }
      c.header("Idempotency-Replayed", "true");
      return c.json(existing.responseBody, existing.responseStatus as ContentfulStatusCode);
    }

    await next();

    // Persist final outcomes only; 5xx stays retryable with the same key.
    if (c.res.status < 500) {
      const bodyText = await c.res.clone().text();
      await db
        .insert(idempotencyRecords)
        .values({
          key,
          userId,
          requestHash,
          responseStatus: c.res.status,
          responseBody: bodyText === "" ? null : JSON.parse(bodyText),
          expiresAt: new Date(Date.now() + RECORD_TTL_HOURS * 60 * 60 * 1000),
        })
        .onConflictDoNothing();
    }
  };
}
