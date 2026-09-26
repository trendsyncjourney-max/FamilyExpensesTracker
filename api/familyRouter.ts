import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import {
  createFamily,
  getMembershipForUser,
  joinFamilyByCode,
  listFamilyMembers,
  requireMembership,
  updateFamilySettings,
} from "./queries/families";
import { listCategories, createCategory } from "./queries/categories";
import { writeAuditEvent } from "./queries/audit";

const DEFAULT_CATEGORIES = [
  { name: "Groceries", icon: "shopping-cart" },
  { name: "Dining", icon: "utensils" },
  { name: "Housing", icon: "home" },
  { name: "Transport", icon: "car" },
  { name: "Utilities", icon: "plug" },
  { name: "Health", icon: "heart-pulse" },
  { name: "Leisure", icon: "ticket" },
  { name: "Other", icon: "shapes" },
];

export const familyRouter = createRouter({
  /** Current family + members, or null when the user has none yet. */
  current: authedQuery.query(async ({ ctx }) => {
    const m = await getMembershipForUser(ctx.user.id);
    if (!m) return null;
    const members = await listFamilyMembers(m.family.id);
    return { family: m.family, myRole: m.membership.role, members };
  }),

  /** Bootstrap: create a family with default shared categories. */
  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        currency: z.string().length(3).default("EUR"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getMembershipForUser(ctx.user.id);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already belong to a family",
        });
      }
      const { familyId, inviteCode } = await createFamily({
        name: input.name,
        currency: input.currency.toUpperCase(),
        userId: ctx.user.id,
      });
      await Promise.all(
        DEFAULT_CATEGORIES.map((c, i) =>
          createCategory({
            familyId,
            name: c.name,
            icon: c.icon,
            scope: "both",
            sortOrder: i,
          }),
        ),
      );
      await writeAuditEvent({
        familyId,
        entityType: "family",
        entityId: familyId,
        action: "created",
        actorId: ctx.user.id,
        after: { name: input.name, currency: input.currency },
      });
      return { familyId, inviteCode };
    }),

  /** Join an existing family via invite code. */
  join: authedQuery
    .input(z.object({ inviteCode: z.string().min(4).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getMembershipForUser(ctx.user.id);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already belong to a family",
        });
      }
      const family = await joinFamilyByCode(input.inviteCode, ctx.user.id);
      await writeAuditEvent({
        familyId: family.id,
        entityType: "family",
        entityId: family.id,
        action: "member_joined",
        actorId: ctx.user.id,
        after: { userId: ctx.user.id },
      });
      return { familyId: family.id, name: family.name };
    }),

  updateSettings: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
        currency: z.string().length(3).optional(),
        advanceAgingWarnDays: z.number().int().min(1).max(90).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const updated = await updateFamilySettings(family.id, input);
      await writeAuditEvent({
        familyId: family.id,
        entityType: "family",
        entityId: family.id,
        action: "settings_updated",
        actorId: ctx.user.id,
        before: {
          name: family.name,
          currency: family.currency,
          advanceAgingWarnDays: family.advanceAgingWarnDays,
        },
        after: input,
      });
      return updated;
    }),

  categories: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    return listCategories(family.id, true);
  }),
});
