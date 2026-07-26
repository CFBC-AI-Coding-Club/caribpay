import type { MiddlewareHandler } from "hono";
import { redis } from "../lib/redis";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../app-env";

/**
 * A fixed-window limiter in Redis, keyed per user.
 *
 * The directory is a lookup oracle over phone numbers and handles: without a
 * limit, an authenticated account can walk it and build a name-and-number list.
 * Brazil's Pix directory has had exactly that incident, so we want a limit and
 * an answer ready.
 *
 * Keys always carry a TTL — redis runs `maxmemory-policy noeviction` here, so
 * anything without one accumulates until writes start failing.
 */
export function rateLimit(bucket: string, limit: number, windowSeconds: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `caribpay:rl:${bucket}:${userId}:${window}`;

    const used = await redis.incr(key);
    if (used === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (used > limit) {
      throw new ApiError(429, "RATE_LIMITED", "Too many lookups — wait a moment and try again");
    }
    await next();
  };
}
