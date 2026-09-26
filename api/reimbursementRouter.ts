import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getPartner, requireMembership } from "./queries/families";
import {
  createReimbursement,
  getReimbursement,
  listReimbursements,
  transitionReimbursement,
} from "./queries/reimbursements";
import { getAccessibleExpense } from "./queries/expenses";
import { writeAuditEvent } from "./queries/audit";
import { createNotification } from "./queries/notifications";

const moneyCents = z.number().int().positive();

async function notifyPartner(
  familyId: number,
  fromUserId: number,
  fromName: string | null,
  entry: { type: string; title: string; body?: string; payload?: unknown },
) {
  const partner = await getPartner(familyId, fromUserId);
  if (!partner) return;
  await createNotification({
    userId: partner.userId,
    familyId,
    type: entry.type,
    title: entry.title,
    body: entry.body ?? `${fromName ?? "Your partner"}: ${entry.title}`,
    payload: entry.payload,
  });
}

export const reimbursementRouter = createRouter({
  inbox: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    return listReimbursements(family.id, "inbox", ctx.user.id);
  }),

  sent: authedQuery.query(async ({ ctx }) => {
    const { family } = await requireMembership(ctx.user.id);
    return listReimbursements(family.id, "sent", ctx.user.id);
  }),

  getById: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      return getReimbursement(family.id, input.id);
    }),

  create: authedQuery
    .input(
      z.object({
        note: z.string().max(2000).optional(),
        currency: z.string().length(3).optional(),
        items: z
          .array(
            z.object({
              expenseId: z.number().int().positive().optional(),
              amountCents: moneyCents,
              note: z.string().max(255).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const partner = await getPartner(family.id, ctx.user.id);
      if (!partner) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No partner in the family to approve this request",
        });
      }
      // Referenced expenses must be shared expenses visible to the requester.
      for (const item of input.items) {
        if (item.expenseId) {
          const expense = await getAccessibleExpense(
            family.id,
            ctx.user.id,
            item.expenseId,
          );
          if (expense.scope !== "shared") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Only shared expenses can be reimbursed",
            });
          }
        }
      }
      const amountCents = input.items.reduce((acc, i) => acc + i.amountCents, 0);
      const request = await createReimbursement({
        familyId: family.id,
        requesterId: ctx.user.id,
        approverId: partner.userId,
        amountCents,
        currency: input.currency ?? family.currency,
        note: input.note,
        items: input.items,
      });
      await writeAuditEvent({
        familyId: family.id,
        entityType: "reimbursement_request",
        entityId: request.id,
        action: "submitted",
        actorId: ctx.user.id,
        after: { amountCents, items: input.items },
      });
      await notifyPartner(family.id, ctx.user.id, ctx.user.name, {
        type: "request_pending",
        title: "New reimbursement request",
        payload: { requestId: request.id },
      });
      return request;
    }),

  approve: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const req = await getReimbursement(family.id, input.id);
      if (req.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can approve" });
      }
      if (req.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot approve from status ${req.status}` });
      }
      await transitionReimbursement(input.id, { status: "approved", respondedAt: new Date() });
      await writeAuditEvent({
        familyId: family.id, entityType: "reimbursement_request", entityId: input.id,
        action: "approved", actorId: ctx.user.id,
        before: { status: req.status }, after: { status: "approved" },
      });
      await notifyPartner(family.id, ctx.user.id, ctx.user.name, {
        type: "approved", title: "Reimbursement approved", payload: { requestId: input.id },
      });
      return getReimbursement(family.id, input.id);
    }),

  reject: authedQuery
    .input(z.object({ id: z.number().int().positive(), reason: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const req = await getReimbursement(family.id, input.id);
      if (req.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the approver can reject" });
      }
      if (req.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reject from status ${req.status}` });
      }
      await transitionReimbursement(input.id, {
        status: "rejected", rejectReason: input.reason, respondedAt: new Date(),
      });
      await writeAuditEvent({
        familyId: family.id, entityType: "reimbursement_request", entityId: input.id,
        action: "rejected", actorId: ctx.user.id,
        before: { status: req.status }, after: { status: "rejected", reason: input.reason },
      });
      await notifyPartner(family.id, ctx.user.id, ctx.user.name, {
        type: "rejected", title: "Reimbursement rejected", payload: { requestId: input.id },
      });
      return getReimbursement(family.id, input.id);
    }),

  cancel: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const req = await getReimbursement(family.id, input.id);
      if (req.requesterId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the requester can cancel" });
      }
      if (req.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only cancel before approval" });
      }
      await transitionReimbursement(input.id, { status: "cancelled" });
      await writeAuditEvent({
        familyId: family.id, entityType: "reimbursement_request", entityId: input.id,
        action: "cancelled", actorId: ctx.user.id, before: { status: req.status },
        after: { status: "cancelled" },
      });
      return getReimbursement(family.id, input.id);
    }),

  /** Approver marks the money as sent. */
  markPaid: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const req = await getReimbursement(family.id, input.id);
      if (req.approverId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the payer can mark paid" });
      }
      if (req.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot mark paid from status ${req.status}` });
      }
      await transitionReimbursement(input.id, { status: "paid", paidAt: new Date() });
      await writeAuditEvent({
        familyId: family.id, entityType: "reimbursement_request", entityId: input.id,
        action: "paid", actorId: ctx.user.id,
        before: { status: req.status }, after: { status: "paid" },
      });
      await notifyPartner(family.id, ctx.user.id, ctx.user.name, {
        type: "payment_sent", title: "Reimbursement paid", payload: { requestId: input.id },
      });
      return getReimbursement(family.id, input.id);
    }),

  /** Requester confirms receipt — closes the loop (two-sided clearing). */
  confirmReceived: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { family } = await requireMembership(ctx.user.id);
      const req = await getReimbursement(family.id, input.id);
      if (req.requesterId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the requester can confirm receipt" });
      }
      if (req.status !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot confirm from status ${req.status}` });
      }
      await transitionReimbursement(input.id, { status: "confirmed", confirmedAt: new Date() });
      await writeAuditEvent({
        familyId: family.id, entityType: "reimbursement_request", entityId: input.id,
        action: "confirmed", actorId: ctx.user.id,
        before: { status: req.status }, after: { status: "confirmed" },
      });
      return getReimbursement(family.id, input.id);
    }),
});
