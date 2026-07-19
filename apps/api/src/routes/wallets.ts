import { Hono } from "hono";
import {
  createWalletRequestSchema,
  createWalletResponseSchema,
  transactionsPageQuerySchema,
  transactionsPageSchema,
  walletsResponseSchema,
} from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import {
  createAdditionalWallet,
  listWalletsWithTotal,
  walletTransactionsPage,
} from "../services/wallets";
import type { AppEnv } from "../app-env";

export const walletRoutes = new Hono<AppEnv>();

walletRoutes.use(requireAuth);

walletRoutes.get("/", async (c) => {
  const result = await listWalletsWithTotal(db, c.get("userId"));
  return c.json(walletsResponseSchema.parse(result), 200);
});

walletRoutes.post("/", async (c) => {
  const body = createWalletRequestSchema.parse(await c.req.json());
  const wallet = await createAdditionalWallet(db, c.get("userId"), body.currency);
  return c.json(createWalletResponseSchema.parse({ wallet }), 201);
});

walletRoutes.get("/:id/transactions", async (c) => {
  const query = transactionsPageQuerySchema.parse(c.req.query());
  const page = await walletTransactionsPage(
    db,
    c.get("userId"),
    c.req.param("id"),
    query.limit,
    query.cursor,
  );
  return c.json(transactionsPageSchema.parse(page), 200);
});
