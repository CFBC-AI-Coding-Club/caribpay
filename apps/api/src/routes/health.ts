import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { redis } from "../lib/redis";
import type { AppEnv } from "../app-env";

async function checkDb(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", async (c) => {
  const [dbUp, redisUp] = await Promise.all([checkDb(), checkRedis()]);
  const body = {
    status: dbUp && redisUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    redis: redisUp ? "up" : "down",
  };
  return c.json(body, dbUp && redisUp ? 200 : 503);
});
