import { Hono } from "hono";
import {
  authResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  registerRequestSchema,
} from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import {
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/auth";
import type { AppEnv } from "../app-env";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  const body = registerRequestSchema.parse(await c.req.json());
  const result = await registerUser(db, body);
  // Responses pass through the shared schema so nothing beyond the contract leaks.
  return c.json(authResponseSchema.parse(result), 201);
});

authRoutes.post("/login", async (c) => {
  const body = loginRequestSchema.parse(await c.req.json());
  const result = await loginUser(db, body);
  return c.json(authResponseSchema.parse(result), 200);
});

authRoutes.post("/refresh", async (c) => {
  const body = refreshRequestSchema.parse(await c.req.json());
  const tokens = await rotateRefreshToken(db, body.refreshToken);
  return c.json(refreshResponseSchema.parse({ tokens }), 200);
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const body = logoutRequestSchema.parse(await c.req.json());
  await revokeRefreshToken(db, c.get("userId"), body.refreshToken);
  return c.body(null, 204);
});
