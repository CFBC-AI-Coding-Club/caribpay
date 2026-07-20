import { Hono } from "hono";
import { z } from "zod";
import {
  SUPPORTED_CURRENCIES,
  qrReceiveResponseSchema,
  qrResolveQuerySchema,
  qrResolveResponseSchema,
} from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { buildReceivePayload, resolvePayload } from "../services/qr";
import type { AppEnv } from "../app-env";

const receiveQuerySchema = z.object({
  // Defaults to the user's home wallet currency at the route level, since the
  // home screen "receive" button is single-currency.
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
});

export const qrRoutes = new Hono<AppEnv>();

qrRoutes.get("/receive", requireAuth, async (c) => {
  const { currency } = receiveQuerySchema.parse(c.req.query());
  const result = await buildReceivePayload(db, c.get("userId"), currency);
  return c.json(qrReceiveResponseSchema.parse(result), 200);
});

qrRoutes.get("/resolve", requireAuth, async (c) => {
  const { payload } = qrResolveQuerySchema.parse(c.req.query());
  const result = resolvePayload(payload);
  return c.json(qrResolveResponseSchema.parse(result), 200);
});
