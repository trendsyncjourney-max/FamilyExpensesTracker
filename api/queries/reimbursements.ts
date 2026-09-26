import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "./connection";

const withRefs = {
  requester: { columns: { id: true, name: true, avatar: true } },
  approver: { columns: { id: true, name: true, avatar: true } },
  items: { with: { expense: true } },
} as const;

export async function listReimbursements(
  familyId: number,
  box: "inbox" | "sent",
  userId: number,
) {
  const base = eq(schema.reimbursementRequests.familyId, familyId);
  const where =
    box === "inbox"
      ? and(base, eq(schema.reimbursementRequests.approverId, userId))
      : and(base, eq(schema.reimbursementRequests.requesterId, userId));
  return getDb().query.reimbursementRequests.findMany({
    where,
    orderBy: [desc(schema.reimbursementRequests.createdAt)],
    with: withRefs,
  });
}

export async function getReimbursement(familyId: number, id: number) {
  const row = await getDb().query.reimbursementRequests.findFirst({
    where: and(
      eq(schema.reimbursementRequests.id, id),
      eq(schema.reimbursementRequests.familyId, familyId),
    ),
    with: withRefs,
  });
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Reimbursement request not found",
    });
  }
  return row;
}

export async function createReimbursement(data: {
  familyId: number;
  requesterId: number;
  approverId: number;
  amountCents: number;
  currency: string;
  note?: string;
  items: { expenseId?: number; amountCents: number; note?: string }[];
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(schema.reimbursementRequests)
    .values({
      familyId: data.familyId,
      requesterId: data.requesterId,
      approverId: data.approverId,
      amountCents: data.amountCents,
      currency: data.currency,
      note: data.note ?? null,
    })
    .$returningId();
  if (data.items.length > 0) {
    await db.insert(schema.reimbursementItems).values(
      data.items.map((item) => ({
        requestId: id,
        expenseId: item.expenseId ?? null,
        amountCents: item.amountCents,
        note: item.note ?? null,
      })),
    );
  }
  return getReimbursement(data.familyId, id);
}

export async function transitionReimbursement(
  id: number,
  patch: Partial<
    Pick<
      schema.ReimbursementRequest,
      "status" | "rejectReason" | "respondedAt" | "paidAt" | "confirmedAt"
    >
  >,
) {
  await getDb()
    .update(schema.reimbursementRequests)
    .set(patch)
    .where(eq(schema.reimbursementRequests.id, id));
}
