import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getPartner, requireMembership } from "./queries/families";
import {
  advanceReconciledCents,
  confirmAdvanceReturnAndApply,
  createAdvance,
  createAdvanceReturn,
  getAdvance,
  listAdvances,
  listOpenAdvancesFor,
  transitionAdvance,
} from "./queries/advances";
import { writeAuditEvent } from "./queries/audit";
import { createNotification } from "./queries/notifications";
import { getDb } from "./queries/connection";
import { advanceOutstandingCents } from "./lib/money";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const moneyCents = z.number().int().positive();

async function outstandingCents(advance: {
  id: number;
  amountCents: number;
  returnedAmountCents: number;
}) {
  const reconciled = await advanceReconciledCents(advance.id);
  return {
    reconciledCents: reconciled,
    outstandingCents: advanceOutstandingCents(
      advance.amountCents,
      reconciled,
      advance.returnedAmountCents,
    ),
  };
}

async function maybeAutoReconcile(familyId: number, advanceId: number, actorId: number) {
  const advance = await getAdvance(familyId, advanceId);
  if (!["disbursed", "reconciling"].includes(advance.status)) return advance;
  const { outstandingCents: outstanding } = await outstandingCents(advance);
  if (outstanding <= 0) {
    await transitionAdvance(advanceId, { status: "reconciled" });
    await writeAuditEvent({
      familyId, entityType: "advance_request", entityId: advanceId,
      action: "reconciled", actorId,
      before: { status: advance.status }, after: { status: "reconciled" },
    });
    return getAdvance(familyId, advanceId);
  }
  if (advance.status === "disbursed") {
    await transitionAdvance(advanceId, { status: "reconciling" });
    return getAdvance(familyId, advanceId);
  }
  return advance;
}

export const advanceRouter = createRouter({
  inbox: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    const rows = await listAdvances(family.id, "inbox", ctx.user.id);
    return Promise.all(rows.map(async (a) => ({ ...a, ...(await outstandingCents(a)) })));
  }),

  sent: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    const rows = await listAdvances(family.id, "sent", ctx.user.id);
    return Promise.all(rows.map(async (a) => ({ ...a, ...(await outstandingCents(a)) })));
  }),

  getById: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      return { ...advance, ...(await outstandingCents(advance)) };
    }),

  /** Request an advance. Blocked while an older advance stays unreconciled. */
  request: authedQuery
    .input(
      z.object({
        amountCents: moneyCents,
        purpose: z.string().min(1).max(255),
        neededByDate: dateString.optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const partner = await getPartner(family.id, ctx.user.id);
      if (!partner) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No partner in the family to approve this advance",
        });
      }
      // Aging guard: block when an unreconciled advance is older than the
      // configured threshold.
      const open = await listOpenAdvancesFor(ctx.user.id);
      const cutoff = Date.now() - family.advanceAgingWarnDays * 86400_000;
      const aged = open.find((a) => a.disbursedAt && a.disbursedAt.getTime() < cutoff);
      if (aged) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You have an unreconciled advance older than ${family.advanceAgingWarnDays} days`,
        });
      }
      const advance = await createAdvance({
        familyId: family.id,
        requesterId: ctx.user.id,
        approverId: partner.userId,
        amountCents: input.amountCents,
        currency: input.currency ?? family.currency,
        purpose: input.purpose,
        neededByDate: input.neededByDate,
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: advance.id,
        action: "submitted", actorId: ctx.user.id, after: input,
      });
      await createNotification({
        userId: partner.userId, familyId: family.id,
        type: "request_pending", title: "New advance request",
        body: `${ctx.user.name ?? "Your partner"} requested an advance: ${input.purpose}`,
        payload: { advanceId: advance.id },
      });
      return advance;
    }),

  approve: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      if (advance.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can approve" });
      }
      if (advance.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot approve from status ${advance.status}` });
      }
      await transitionAdvance(input.id, { status: "approved" });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: input.id,
        action: "approved", actorId: ctx.user.id,
        before: { status: advance.status }, after: { status: "approved" },
      });
      await createNotification({
        userId: advance.requesterId, familyId: family.id,
        type: "approved", title: "Advance approved",
        payload: { advanceId: input.id },
      });
      return getAdvance(family.id, input.id);
    }),

  reject: authedQuery
    .input(z.object({ id: z.number().int().positive(), reason: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      if (advance.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can reject" });
      }
      if (advance.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reject from status ${advance.status}` });
      }
      await transitionAdvance(input.id, { status: "rejected", rejectReason: input.reason });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: input.id,
        action: "rejected", actorId: ctx.user.id,
        before: { status: advance.status }, after: { status: "rejected", reason: input.reason },
      });
      return getAdvance(family.id, input.id);
    }),

  cancel: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      if (advance.requesterId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the requester can cancel" });
      }
      if (!["submitted", "approved"].includes(advance.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only cancel before disbursement" });
      }
      await transitionAdvance(input.id, { status: "cancelled" });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: input.id,
        action: "cancelled", actorId: ctx.user.id,
        before: { status: advance.status }, after: { status: "cancelled" },
      });
      return getAdvance(family.id, input.id);
    }),

  /** Approver marks the money as handed over. */
  disburse: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      if (advance.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can disburse" });
      }
      if (advance.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot disburse from status ${advance.status}` });
      }
      await transitionAdvance(input.id, { status: "disbursed", disbursedAt: new Date() });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: input.id,
        action: "disbursed", actorId: ctx.user.id,
        before: { status: advance.status }, after: { status: "disbursed" },
      });
      await createNotification({
        userId: advance.requesterId, familyId: family.id,
        type: "advance_granted", title: "Advance disbursed",
        payload: { advanceId: input.id },
      });
      return getAdvance(family.id, input.id);
    }),

  /**
   * Recompute reconciliation after receipts are linked (expenses carry
   * advanceId). Auto-flips disbursed → reconciling → reconciled.
   */
  reconcile: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await maybeAutoReconcile(family.id, input.id, ctx.user.id);
      return { ...advance, ...(await outstandingCents(advance)) };
    }),

  /** Requester records returning the remainder in cash. */
  returnRemainder: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        amountCents: moneyCents,
        date: dateString,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const advance = await getAdvance(family.id, input.id);
      if (advance.requesterId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the requester can return a remainder" });
      }
      if (!["disbursed", "reconciling"].includes(advance.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot return remainder from status ${advance.status}` });
      }
      const { outstandingCents: outstanding } = await outstandingCents(advance);
      if (input.amountCents > outstanding) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Return exceeds the outstanding remainder" });
      }
      const advanceReturn = await createAdvanceReturn({
        advanceId: input.id,
        amountCents: input.amountCents,
        date: input.date,
        createdById: ctx.user.id,
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: input.id,
        action: "remainder_returned", actorId: ctx.user.id,
        after: { advanceReturnId: advanceReturn!.id, amountCents: input.amountCents },
      });
      await createNotification({
        userId: advance.approverId, familyId: family.id,
        type: "return_update", title: "Advance remainder returned",
        payload: { advanceId: input.id, advanceReturnId: advanceReturn!.id },
      });
      return advanceReturn;
    }),

  /** Approver confirms receipt of the returned remainder. */
  confirmReturn: authedQuery
    .input(z.object({ returnId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const db = getDb();
      const advanceReturn = await db.query.advanceReturns.findFirst({
        where: (t, { eq }) => eq(t.id, input.returnId),
      });
      if (!advanceReturn) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Return not found" });
      }
      const advance = await getAdvance(family.id, advanceReturn.advanceId);
      if (advance.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can confirm the return" });
      }
      if (advanceReturn.status !== "pending_confirm") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Return already confirmed" });
      }
      // Re-validate against the *current* outstanding remainder so new
      // reconciled receipts cannot make this confirmation overshoot.
      const { outstandingCents: outstanding } = await outstandingCents(advance);
      if (advanceReturn.amountCents > outstanding) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return exceeds the current outstanding remainder",
        });
      }
      await confirmAdvanceReturnAndApply({
        returnId: input.returnId,
        advanceId: advance.id,
        confirmedById: ctx.user.id,
        newReturnedAmountCents: advance.returnedAmountCents + advanceReturn.amountCents,
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "advance_request", entityId: advance.id,
        action: "remainder_confirmed", actorId: ctx.user.id,
        after: { advanceReturnId: input.returnId, amountCents: advanceReturn.amountCents },
      });
      const updated = await maybeAutoReconcile(family.id, advance.id, ctx.user.id);
      return { ...updated, ...(await outstandingCents(updated)) };
    }),
});
