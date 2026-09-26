import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getPartner, requireMembership } from "./queries/families";
import {
  createExpense,
  createRefundAndUpdateStatus,
  getAccessibleExpense,
  listPersonalExpenses,
  listSharedExpenses,
  totalRefundedCents,
  updateExpense,
} from "./queries/expenses";
import { writeAuditEvent, listAuditEventsForEntity } from "./queries/audit";
import { createNotification } from "./queries/notifications";
import { getAdvance } from "./queries/advances";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const moneyCents = z.number().int().positive("Amount must be positive cents");

/**
 * Receipts are stored as data URLs (or object-storage URLs) in a MEDIUMTEXT
 * column (16 MiB). Enforce an app-level cap well below that so requests stay
 * reasonable: ~8M chars ≈ 6 MiB of base64 image data.
 */
export const MAX_RECEIPT_URL_CHARS = 8_000_000;
const receiptSchema = z
  .object({
    url: z
      .string()
      .max(MAX_RECEIPT_URL_CHARS, "Receipt image is too large to store")
      .refine((s) => /^(data:|https?:\/\/)/.test(s), "Receipt must be a data or http(s) URL"),
    key: z.string().max(512).optional(),
    contentType: z.string().max(128).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .optional();

/**
 * Audit familyId for an expense: personal-scope rows must never leak into
 * the family audit feed, so their events are written with familyId = null.
 * They remain reachable to the owner via the per-entity audit trail.
 */
function auditFamilyId(scope: string, familyId: number): number | null {
  return scope === "personal" ? null : familyId;
}

async function requireWriteAccess(
  expense: { ownerId: number; createdById: number; scope: string },
  userId: number,
) {
  // Personal rows are only writable by the owner; shared rows by any member.
  if (expense.scope === "personal" && expense.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your personal expense" });
  }
}

export const expenseRouter = createRouter({
  /** Shared family ledger. */
  list: authedQuery
    .input(
      z
        .object({
          from: dateString.optional(),
          to: dateString.optional(),
          status: z.enum(["draft", "posted", "disputed", "resolved", "voided"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return listSharedExpenses(family.id, input ?? undefined);
    }),

  /** Personal area — hard isolated to the caller. */
  listPersonal: authedQuery
    .input(
      z
        .object({ from: dateString.optional(), to: dateString.optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return listPersonalExpenses(family.id, ctx.user.id, input ?? undefined);
    }),

  getById: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return getAccessibleExpense(family.id, ctx.user.id, input.id);
    }),

  create: authedQuery
    .input(
      z.object({
        scope: z.enum(["shared", "personal"]).default("shared"),
        amountCents: moneyCents,
        currency: z.string().length(3).optional(),
        merchant: z.string().max(255).optional(),
        date: dateString,
        categoryId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
        asDraft: z.boolean().default(false),
        advanceId: z.number().int().positive().optional(),
        projectedExpenseId: z.number().int().positive().optional(),
        receipt: receiptSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      // Personal expenses always belong to (and are paid by) their owner.
      const ownerId = ctx.user.id;
      if (input.advanceId) {
        // Advances fund shared expenses only: a personal expense linked to
        // an advance would leak private data into the shared advance view.
        if (input.scope === "personal") {
          // Audit the rejection without private details (merchant/notes/
          // receipt stay out of any audit payload).
          await writeAuditEvent({
            familyId: null,
            entityType: "expense",
            entityId: 0,
            action: "create_rejected",
            actorId: ctx.user.id,
            after: {
              reason: "personal_expense_cannot_link_advance",
              advanceId: input.advanceId,
            },
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Personal expenses cannot be linked to an advance",
          });
        }
        // Linking a receipt to an advance: advance must be in reconciliation
        // and only the advance requester can reconcile it.
        const advance = await getAdvance(family.id, input.advanceId);
        if (advance.requesterId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the advance requester can link receipts to this advance",
          });
        }
        if (!["disbursed", "reconciling"].includes(advance.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Advance is not open for reconciliation",
          });
        }
      }
      const expense = await createExpense({
        familyId: family.id,
        scope: input.scope,
        ownerId,
        payerId: ctx.user.id,
        createdById: ctx.user.id,
        amountCents: input.amountCents,
        currency: input.currency ?? family.currency,
        merchant: input.merchant,
        date: input.date,
        categoryId: input.categoryId,
        notes: input.notes,
        status: input.asDraft ? "draft" : "posted",
        advanceId: input.advanceId,
        projectedExpenseId: input.projectedExpenseId,
        receiptUrl: input.receipt?.url,
        receiptKey: input.receipt?.key,
        receiptContentType: input.receipt?.contentType,
        receiptSizeBytes: input.receipt?.sizeBytes,
      });
      await writeAuditEvent({
        familyId: auditFamilyId(input.scope, family.id),
        entityType: "expense",
        entityId: expense!.id,
        action: "created",
        actorId: ctx.user.id,
        after: expense,
      });
      if (input.scope === "shared") {
        const partner = await getPartner(family.id, ctx.user.id);
        if (partner) {
          await createNotification({
            userId: partner.userId,
            familyId: family.id,
            type: "expense_added",
            title: "New shared expense",
            body: `${ctx.user.name ?? "Your partner"} added ${input.merchant ?? "an expense"}`,
            payload: { expenseId: expense!.id },
          });
        }
      }
      return expense;
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        amountCents: moneyCents.optional(),
        currency: z.string().length(3).optional(),
        merchant: z.string().max(255).nullable().optional(),
        date: dateString.optional(),
        categoryId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        receipt: receiptSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const expense = await getAccessibleExpense(family.id, ctx.user.id, input.id);
      await requireWriteAccess(expense, ctx.user.id);
      if (expense.status === "voided") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expense is voided" });
      }
      const { id, receipt, ...patch } = input;
      const updated = await updateExpense(id, {
        ...patch,
        ...(receipt
          ? {
              receiptUrl: receipt.url,
              receiptKey: receipt.key ?? null,
              receiptContentType: receipt.contentType ?? null,
              receiptSizeBytes: receipt.sizeBytes ?? null,
            }
          : {}),
      });
      await writeAuditEvent({
        familyId: auditFamilyId(expense.scope, family.id),
        entityType: "expense",
        entityId: id,
        action: "updated",
        actorId: ctx.user.id,
        before: expense,
        after: updated,
      });
      return updated;
    }),

  /** Status transitions: post draft, dispute, resolve, void. */
  transition: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        action: z.enum(["post", "dispute", "resolve", "void"]),
        comment: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const expense = await getAccessibleExpense(family.id, ctx.user.id, input.id);
      await requireWriteAccess(expense, ctx.user.id);
      const next: Record<string, typeof expense.status> = {
        post: "posted",
        dispute: "disputed",
        resolve: "resolved",
        void: "voided",
      };
      const allowed: Record<string, string[]> = {
        draft: ["post", "void"],
        posted: ["dispute", "void"],
        disputed: ["resolve", "void"],
        resolved: ["dispute", "void"],
        voided: [],
      };
      if (!allowed[expense.status].includes(input.action)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot ${input.action} an expense in status ${expense.status}`,
        });
      }
      const updated = await updateExpense(input.id, {
        status: next[input.action],
        ...(input.comment ? { notes: [expense.notes, input.comment].filter(Boolean).join("\n") } : {}),
      });
      await writeAuditEvent({
        familyId: auditFamilyId(expense.scope, family.id),
        entityType: "expense",
        entityId: input.id,
        action: input.action,
        actorId: ctx.user.id,
        before: { status: expense.status },
        after: { status: next[input.action], comment: input.comment },
      });
      return updated;
    }),

  /** Register a return/refund against an expense. */
  addRefund: authedQuery
    .input(
      z.object({
        expenseId: z.number().int().positive(),
        amountCents: moneyCents,
        date: dateString,
        method: z.enum(["cash", "card", "other"]).default("card"),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const expense = await getAccessibleExpense(family.id, ctx.user.id, input.expenseId);
      await requireWriteAccess(expense, ctx.user.id);
      if (expense.status === "voided") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expense is voided" });
      }
      const already = await totalRefundedCents(input.expenseId);
      if (already + input.amountCents > expense.amountCents) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refunds exceed the original expense amount",
        });
      }
      const newTotal = already + input.amountCents;
      const returnStatus =
        newTotal >= expense.amountCents ? "fully_refunded" : "partially_refunded";
      const { refund, expense: updated } = await createRefundAndUpdateStatus({
        ...input,
        createdById: ctx.user.id,
        returnStatus,
      });
      await writeAuditEvent({
        familyId: auditFamilyId(expense.scope, family.id),
        entityType: "expense",
        entityId: input.expenseId,
        action: "refund_added",
        actorId: ctx.user.id,
        after: { refund, returnStatus },
      });
      return { refund, expense: updated };
    }),

  /** Mark a return flow as initiated or rejected without a refund yet. */
  setReturnStatus: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        returnStatus: z.enum(["none", "return_initiated", "return_rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const expense = await getAccessibleExpense(family.id, ctx.user.id, input.id);
      await requireWriteAccess(expense, ctx.user.id);
      const updated = await updateExpense(input.id, {
        returnStatus: input.returnStatus,
      });
      await writeAuditEvent({
        familyId: auditFamilyId(expense.scope, family.id),
        entityType: "expense",
        entityId: input.id,
        action: "return_status",
        actorId: ctx.user.id,
        before: { returnStatus: expense.returnStatus },
        after: { returnStatus: input.returnStatus },
      });
      return updated;
    }),

  /** Per-expense audit trail (respects the same access predicate). */
  auditTrail: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      await getAccessibleExpense(family.id, ctx.user.id, input.id);
      return listAuditEventsForEntity("expense", input.id);
    }),
});
