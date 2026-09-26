import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { requireMembership } from "./queries/families";
import {
  listCategories,
  createCategory,
  updateCategory,
} from "./queries/categories";
import { writeAuditEvent } from "./queries/audit";

const scopeSchema = z.enum(["shared", "personal", "both"]);

export const categoryRouter = createRouter({
  list: authedQuery
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return listCategories(family.id, input?.includeArchived ?? false);
    }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(128),
        icon: z.string().max(64).optional(),
        scope: scopeSchema.default("shared"),
        sortOrder: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const category = await createCategory({ familyId: family.id, ...input });
      await writeAuditEvent({
        familyId: family.id,
        entityType: "category",
        entityId: category!.id,
        action: "created",
        actorId: ctx.user.id,
        after: input,
      });
      return category;
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(128).optional(),
        icon: z.string().max(64).nullable().optional(),
        scope: scopeSchema.optional(),
        sortOrder: z.number().int().min(0).optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const { id, ...patch } = input;
      const updated = await updateCategory(family.id, id, patch);
      await writeAuditEvent({
        familyId: family.id,
        entityType: "category",
        entityId: id,
        action: patch.archived === true ? "archived" : "updated",
        actorId: ctx.user.id,
        after: patch,
      });
      return updated;
    }),
});
