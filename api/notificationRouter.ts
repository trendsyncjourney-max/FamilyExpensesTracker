import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./queries/notifications";

export const notificationRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(({ ctx, input }) =>
      listNotifications(ctx.user.id, input?.limit ?? 50),
    ),

  unreadCount: authedQuery.query(({ ctx }) =>
    countUnreadNotifications(ctx.user.id),
  ),

  markRead: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => markNotificationRead(ctx.user.id, input.id)),

  markAllRead: authedQuery.mutation(({ ctx }) =>
    markAllNotificationsRead(ctx.user.id),
  ),
});
