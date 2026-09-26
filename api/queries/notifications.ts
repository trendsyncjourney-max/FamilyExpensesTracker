import { and, desc, eq, isNull } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function listNotifications(userId: number, limit = 50) {
  return getDb().query.notifications.findMany({
    where: eq(schema.notifications.userId, userId),
    orderBy: [desc(schema.notifications.createdAt)],
    limit,
  });
}

export async function countUnreadNotifications(userId: number) {
  const rows = await getDb()
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt),
      ),
    );
  return rows.length;
}

export async function createNotification(entry: {
  userId: number;
  familyId?: number | null;
  type: string;
  title: string;
  body?: string;
  payload?: unknown;
}) {
  await getDb().insert(schema.notifications).values({
    userId: entry.userId,
    familyId: entry.familyId ?? null,
    type: entry.type,
    title: entry.title,
    body: entry.body ?? null,
    payload: entry.payload === undefined ? null : JSON.parse(JSON.stringify(entry.payload)),
  });
}

export async function markNotificationRead(userId: number, id: number) {
  await getDb()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, userId),
      ),
    );
}

export async function markAllNotificationsRead(userId: number) {
  await getDb()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt),
      ),
    );
}
