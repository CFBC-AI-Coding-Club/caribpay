import { Hono } from "hono";
import { qrResolveQuerySchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { buildReceivePayload, resolvePayload } from "../services/qr";
import type { AppEnv } from "../app-env";

export const qrRoutes = new Hono<AppEnv>();

qrRoutes.get("/receive", requireAuth, async (c) => {
  return c.json(await buildReceivePayload(db, c.get("userId")));
});

qrRoutes.get("/resolve", requireAuth, async (c) => {
  const query = qrResolveQuerySchema.parse({ payload: c.req.query("payload") });
  return c.json(resolvePayload(query.payload));
});
