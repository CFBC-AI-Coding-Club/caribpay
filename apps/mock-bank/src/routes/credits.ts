import { Hono } from "hono";
import { creditRequestSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { bankIdempotency } from "../middleware/idempotency";
import { postCredit } from "../services/bank";
import type { BankAppEnv } from "../app-env";

export const creditRoutes = new Hono<BankAppEnv>();

creditRoutes.post("/", bankIdempotency(), async (c) => {
  const body = creditRequestSchema.parse(await c.req.json());
  return c.json(await postCredit(db, body), 201);
});
