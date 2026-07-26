import { Hono } from "hono";
import {
  availabilityQuerySchema,
  claimKeyRequestSchema,
  resolveQuerySchema,
  verifyKeyRequestSchema,
} from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import {
  checkVpaAvailability,
  claimKey,
  listKeys,
  releaseKey,
  resolveKey,
  verifyKey,
} from "../services/directory";
import type { AppEnv } from "../app-env";

export const directoryRoutes = new Hono<AppEnv>();

directoryRoutes.use("*", requireAuth);

/**
 * A name-lookup oracle over phone numbers and handles, so it is authenticated,
 * rate limited, and logged with the requesting user.
 */
directoryRoutes.get("/resolve", rateLimit("directory-resolve", 20, 60), async (c) => {
  const query = resolveQuerySchema.parse({ key: c.req.query("key") });
  const userId = c.get("userId");
  const resolved = await resolveKey(db, userId, query.key);
  console.log(`[directory] ${userId} resolved ${resolved.key}`);
  // The internal ids the transfer service needs never leave the server.
  const { userId: _payeeId, accountId: _accountId, ...publicFields } = resolved;
  return c.json(publicFields);
});

directoryRoutes.get("/available", rateLimit("directory-available", 60, 60), async (c) => {
  const query = availabilityQuerySchema.parse({ vpa: c.req.query("vpa") });
  return c.json(await checkVpaAvailability(db, query.vpa));
});

directoryRoutes.get("/keys", async (c) => {
  return c.json({ keys: await listKeys(db, c.get("userId")) });
});

directoryRoutes.post("/keys", async (c) => {
  const body = claimKeyRequestSchema.parse(await c.req.json());
  const result = await claimKey(db, c.get("userId"), body);
  return c.json(result, 201);
});

directoryRoutes.post("/keys/:id/verify", async (c) => {
  // The code is accepted and ignored: the prototype auto-approves, exactly as
  // signup auto-verifies KYC. The flow exists so the question has an answer.
  verifyKeyRequestSchema.parse(await c.req.json());
  return c.json({ key: await verifyKey(db, c.get("userId"), c.req.param("id")) });
});

directoryRoutes.delete("/keys/:id", async (c) => {
  await releaseKey(db, c.get("userId"), c.req.param("id"));
  return c.json({ released: true });
});
