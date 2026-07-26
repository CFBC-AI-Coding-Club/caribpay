import { Hono } from "hono";
import { verifyAccountRequestSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { getBalance, verifyAccount } from "../services/bank";
import type { BankAppEnv } from "../app-env";

export const accountRoutes = new Hono<BankAppEnv>();

accountRoutes.post("/verify", async (c) => {
  const body = verifyAccountRequestSchema.parse(await c.req.json());
  return c.json(await verifyAccount(db, body.accountRef));
});

accountRoutes.get("/:ref/balance", async (c) => {
  return c.json(await getBalance(db, c.req.param("ref")));
});
