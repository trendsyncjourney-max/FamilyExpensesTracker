import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { requireMembership } from "./queries/families";
import {
  createProjection,
  getProjection,
  listProjections,
  updateProjection,
} from "./queries/projections";
import { getAccessibleExpense } from "./queries/expenses";
import { writeAuditEvent } from "./queries/audit";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const projectionRouter = createRouter({
  /** Calendar view: projections in a date range (defaults to ±3 months). */
  list: authedQuery
    .input(
      z
        .object({ from: dateString.optional(), to: dateString.optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return listProjections(family.id, input ?? undefined);
    }),

  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(255),
        amountCents: z.number().int().positive(),
        currency: z.string().length(3).optional(),
        categoryId: z.number().int().positive().optional(),
        dueDate: dateString,
        recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
        recurrenceUntil: dateString.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const projection = await createProjection({
        familyId: family.id,
        title: input.title,
        amountCents: input.amountCents,
        currency: input.currency ?? family.currency,
        categoryId: input.categoryId,
        dueDate: input.dueDate,
        recurrence: input.recurrence,
        recurrenceUntil: input.recurrenceUntil,
        createdById: ctx.user.id,
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "projected_expense",
        entityId: projection.id, action: "created", actorId: ctx.user.id, after: input,
      });
      return projection;
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        amountCents: z.number().int().positive().optional(),
        categoryId: z.number().int().positive().nullable().optional(),
        dueDate: dateString.optional(),
        recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).optional(),
        recurrenceUntil: dateString.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const existing = await getProjection(family.id, input.id);
      const { id, ...patch } = input;
      await updateProjection(id, patch);
      await writeAuditEvent({
        familyId: family.id, entityType: "projected_expense", entityId: id,
        action: "updated", actorId: ctx.user.id, before: existing, after: patch,
      });
      return getProjection(family.id, id);
    }),

  skip: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const existing = await getProjection(family.id, input.id);
      if (existing.status !== "planned") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot skip from status ${existing.status}` });
      }
      await updateProjection(input.id, { status: "skipped" });
      await writeAuditEvent({
        familyId: family.id, entityType: "projected_expense", entityId: input.id,
        action: "skipped", actorId: ctx.user.id,
        before: { status: existing.status }, after: { status: "skipped" },
      });
      return getProjection(family.id, input.id);
    }),

  /** Link a realized actual expense — excludes the projection from forecasts. */
  realize: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        expenseId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const existing = await getProjection(family.id, input.id);
      if (existing.status !== "planned") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot realize from status ${existing.status}` });
      }
      const expense = await getAccessibleExpense(family.id, ctx.user.id, input.expenseId);
      if (expense.scope !== "shared") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only shared expenses realize projections" });
      }
      await updateProjection(input.id, {
        status: "realized",
        realizedExpenseId: input.expenseId,
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "projected_expense", entityId: input.id,
        action: "realized", actorId: ctx.user.id,
        before: { status: existing.status },
        after: { status: "realized", expenseId: input.expenseId },
      });
      return getProjection(family.id, input.id);
    }),
});
