import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Notification, NotificationType, NotificationsPage } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { notifications } from "../db/schema";
import { ApiError } from "../lib/errors";

type NotificationRow = typeof notifications.$inferSelect;

function toPublic(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: (row.data ?? {}) as Record<string, unknown>,
    readAt: row.readAt === null ? null : row.readAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Write a notification.
 *
 * Always called with a transaction handle, inside the same DB transaction as the
 * status change it describes — if the money moved, the notification exists.
 * There is deliberately no queue and no retry here: a second write is a second
 * thing that can fail.
 */
export async function writeNotification(
  dbh: DbHandle,
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await dbh.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
  });
}

export async function listNotifications(
  dbh: DbHandle,
  userId: string,
  limit: number,
  cursor?: string,
): Promise<NotificationsPage> {
  const cursorCondition =
    cursor === undefined
      ? sql`TRUE`
      : sql`(${notifications.createdAt}, ${notifications.id}) < ((SELECT n2.created_at FROM notifications n2 WHERE n2.id = ${cursor}::uuid), ${cursor}::uuid)`;

  const rows = await dbh
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), cursorCondition))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  return {
    items: page.map(toPublic),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

export async function unreadCount(dbh: DbHandle, userId: string): Promise<number> {
  const [row] = await dbh
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markRead(dbh: DbHandle, userId: string, id: string): Promise<void> {
  const updated = await dbh
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  if (updated.length === 0) {
    // Already read, or not theirs. Re-reading is not an error; a missing row is.
    const [exists] = await dbh
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    if (exists === undefined) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "No such notification");
    }
  }
}

export async function markAllRead(dbh: DbHandle, userId: string): Promise<void> {
  await dbh
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
