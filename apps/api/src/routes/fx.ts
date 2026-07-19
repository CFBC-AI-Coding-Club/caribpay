import { Hono } from "hono";
import { fxQuoteQuerySchema, fxQuoteResponseSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { createQuote } from "../services/fx";
import type { AppEnv } from "../app-env";

export const fxRoutes = new Hono<AppEnv>();

fxRoutes.get("/quote", requireAuth, async (c) => {
  const query = fxQuoteQuerySchema.parse(c.req.query());
  const quote = await createQuote(db, query.from, query.to, query.amountMinor);
  return c.json(fxQuoteResponseSchema.parse({ quote }), 200);
});
