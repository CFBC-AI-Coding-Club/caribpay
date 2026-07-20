import { Hono } from "hono";
import { transactionsPageQuerySchema, transactionsPageSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { listUserTransactions } from "../services/feed";
import type { AppEnv } from "../app-env";

export const transactionRoutes = new Hono<AppEnv>();

transactionRoutes.get("/", requireAuth, async (c) => {
  const query = transactionsPageQuerySchema.parse(c.req.query());
  const page = await listUserTransactions(db, c.get("userId"), query.limit, query.cursor);
  return c.json(transactionsPageSchema.parse(page), 200);
});
