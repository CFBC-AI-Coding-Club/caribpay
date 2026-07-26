import { Hono } from "hono";
import { notificationsPageQuerySchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "../services/notifications";
import type { AppEnv } from "../app-env";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/", async (c) => {
  const query = notificationsPageQuerySchema.parse({
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit"),
  });
  return c.json(await listNotifications(db, c.get("userId"), query.limit, query.cursor));
});

notificationRoutes.get("/unread-count", async (c) => {
  return c.json({ unread: await unreadCount(db, c.get("userId")) });
});

notificationRoutes.post("/read-all", async (c) => {
  await markAllRead(db, c.get("userId"));
  return c.json({ ok: true });
});

notificationRoutes.post("/:id/read", async (c) => {
  await markRead(db, c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});
