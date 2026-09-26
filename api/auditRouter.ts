import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { requireMembership } from "./queries/families";
import { listAuditEvents } from "./queries/audit";

export const auditRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return listAuditEvents(family.id, input?.limit ?? 100);
    }),
});
