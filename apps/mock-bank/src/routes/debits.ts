import { Hono } from "hono";
import { holdRequestSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { bankIdempotency } from "../middleware/idempotency";
import { confirmDebit, placeHold, releaseHold } from "../services/bank";
import type { BankAppEnv } from "../app-env";

export const debitRoutes = new Hono<BankAppEnv>();

debitRoutes.post("/hold", bankIdempotency(), async (c) => {
  const body = holdRequestSchema.parse(await c.req.json());
  return c.json(await placeHold(db, body), 201);
});

debitRoutes.post("/:holdRef/confirm", bankIdempotency(), async (c) => {
  return c.json(await confirmDebit(db, c.req.param("holdRef")));
});

debitRoutes.post("/:holdRef/release", bankIdempotency(), async (c) => {
  const holdRef = c.req.param("holdRef");
  await releaseHold(db, holdRef);
  return c.json({ holdRef, released: true });
});
