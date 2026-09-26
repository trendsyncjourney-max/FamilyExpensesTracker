import { createRouter, authedQuery } from "./middleware";
import { requireMembership } from "./queries/families";
import { getDashboardSummary } from "./queries/dashboard";

export const dashboardRouter = createRouter({
  summary: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    const summary = await getDashboardSummary(family.id, ctx.user.id);
    return { ...summary, currency: family.currency };
  }),
});
