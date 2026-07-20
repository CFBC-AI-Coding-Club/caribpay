import { Hono } from "hono";
import { z } from "zod";
import { transferRequestSchema, transferResponseSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { createTransfer, getTransferForUser } from "../services/transfers";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../app-env";

export const transferRoutes = new Hono<AppEnv>();

transferRoutes.use(requireAuth);

transferRoutes.post("/", idempotency(), async (c) => {
  const body = transferRequestSchema.parse(await c.req.json());
  const idempotencyKey = c.req.header("Idempotency-Key")!;
  const { transaction, replayed } = await createTransfer(db, c.get("userId"), body, idempotencyKey);
  return c.json(transferResponseSchema.parse({ transaction }), replayed ? 200 : 201);
});

transferRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!z.uuid().safeParse(id).success) {
    throw new ApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
  }
  const transaction = await getTransferForUser(db, c.get("userId"), id);
  return c.json(transferResponseSchema.parse({ transaction }), 200);
});
