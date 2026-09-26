import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { familyRouter } from "./familyRouter";
import { categoryRouter } from "./categoryRouter";
import { expenseRouter } from "./expenseRouter";
import { reimbursementRouter } from "./reimbursementRouter";
import { advanceRouter } from "./advanceRouter";
import { projectionRouter } from "./projectionRouter";
import { dashboardRouter } from "./dashboardRouter";
import { notificationRouter } from "./notificationRouter";
import { auditRouter } from "./auditRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  family: familyRouter,
  category: categoryRouter,
  expense: expenseRouter,
  reimbursement: reimbursementRouter,
  advance: advanceRouter,
  projection: projectionRouter,
  dashboard: dashboardRouter,
  notification: notificationRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
