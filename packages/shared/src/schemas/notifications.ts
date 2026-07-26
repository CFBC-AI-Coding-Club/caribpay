import { z } from "zod";
import { NOTIFICATION_TYPES } from "../constants";

/**
 * An event the recipient needs to know about. The row is written inside the same
 * DB transaction as the status flip it describes, so if the money moved the
 * notification exists — there is no best-effort second write to lose.
 */
export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  /** Deep-link payload, e.g. `{ transactionId }`. Shape varies by type. */
  data: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationsPageQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationsPageQuery = z.infer<typeof notificationsPageQuerySchema>;

export const notificationsPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.uuid().nullable(),
});
export type NotificationsPage = z.infer<typeof notificationsPageSchema>;

export const unreadCountResponseSchema = z.object({
  unread: z.number().int().min(0),
});
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
