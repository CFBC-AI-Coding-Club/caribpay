import { Hono } from "hono";
import { linkAccountRequestSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { accountBalance, linkAccount, listAccounts, listInstitutions } from "../services/accounts";
import type { AppEnv } from "../app-env";

export const institutionRoutes = new Hono<AppEnv>();

institutionRoutes.get("/", requireAuth, async (c) => {
  return c.json({ institutions: await listInstitutions(db) });
});

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.use("*", requireAuth);

accountRoutes.get("/", async (c) => {
  return c.json({ accounts: await listAccounts(db, c.get("userId")) });
});

accountRoutes.post("/", async (c) => {
  const body = linkAccountRequestSchema.parse(await c.req.json());
  return c.json({ account: await linkAccount(db, c.get("userId"), body) }, 201);
});

/** Proxied live to the bank and cached nowhere. */
accountRoutes.get("/:id/balance", async (c) => {
  return c.json({ balance: await accountBalance(db, c.get("userId"), c.req.param("id")) });
});
