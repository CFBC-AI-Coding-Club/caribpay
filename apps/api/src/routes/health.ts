import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { AppEnv } from "../app-env";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    return c.json({ status: "degraded", db: "down" }, 503);
  }
  // Redis is reported once a redis client exists (fx quotes / settlement queue phases).
  return c.json({ status: "ok", db: "up" }, 200);
});
