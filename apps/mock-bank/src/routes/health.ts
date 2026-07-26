import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { BankAppEnv } from "../app-env";

export const healthRoutes = new Hono<BankAppEnv>();

healthRoutes.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", db: "up" });
  } catch {
    return c.json({ status: "degraded", db: "down" }, 503);
  }
});
