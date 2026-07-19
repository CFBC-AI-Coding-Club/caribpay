import { Hono } from "hono";
import { meResponseSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { getPublicUser } from "../services/auth";
import type { AppEnv } from "../app-env";

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/me", requireAuth, async (c) => {
  const user = await getPublicUser(db, c.get("userId"));
  return c.json(meResponseSchema.parse({ user }), 200);
});
