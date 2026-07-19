import { Redis } from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.redisUrl);

/** For tests and graceful shutdown; the connection otherwise keeps the process alive. */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}
