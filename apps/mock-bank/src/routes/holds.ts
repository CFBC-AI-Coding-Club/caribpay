import { Hono } from "hono";
import { db } from "../db/client";
import { listOutstandingHolds } from "../services/bank";
import type { BankAppEnv } from "../app-env";

export const holdRoutes = new Hono<BankAppEnv>();

/** For `reconcile`: money still reserved at a bank with nothing driving it. */
holdRoutes.get("/", async (c) => {
  if (c.req.query("status") !== "outstanding") {
    return c.json({ holds: [] });
  }
  return c.json({ holds: await listOutstandingHolds(db) });
});
