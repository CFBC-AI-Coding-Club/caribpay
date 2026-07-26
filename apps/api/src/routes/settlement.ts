import { Hono } from "hono";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { fxBookPositions, listBankPositions } from "../services/clearing";
import type { AppEnv } from "../app-env";

export const settlementRoutes = new Hono<AppEnv>();

/**
 * What each member bank currently owes or is owed, and the switch's own FX
 * exposure. The same numbers `bun run settle` nets down.
 */
settlementRoutes.get("/positions", requireAuth, async (c) => {
  return c.json({
    positions: await listBankPositions(db),
    fxBook: await fxBookPositions(db),
  });
});
