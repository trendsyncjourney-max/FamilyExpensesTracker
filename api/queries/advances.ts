import { and, desc, eq, inArray, sum } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "./connection";
import {
  OPEN_ADVANCE_STATUSES,
  RECONCILING_EXPENSE_STATUSES,
} from "../lib/money";

const withRefs = {
  requester: { columns: { id: true, name: true, avatar: true } },
  approver: { columns: { id: true, name: true, avatar: true } },
  linkedExpenses: {
    with: { category: true },
  },
  returns: true,
} as const;

/**
 * Privacy guard: advance responses are visible to both partners, so any
 * legacy personal-scope expense linked to an advance must never leak its
 * merchant/date/category/notes. Personal rows are dropped entirely.
 */
function stripPersonalLinkedExpenses<T extends { linkedExpenses?: { scope: string }[] }>(row: T): T {
  if (!row.linkedExpenses) return row;
  return {
    ...row,
    linkedExpenses: row.linkedExpenses.filter((e) => e.scope === "shared"),
  };
}

export async function listAdvances(
  familyId: number,
  box: "inbox" | "sent",
  userId: number,
) {
  const base = eq(schema.advanceRequests.familyId, familyId);
  const where =
    box === "inbox"
      ? and(base, eq(schema.advanceRequests.approverId, userId))
      : and(base, eq(schema.advanceRequests.requesterId, userId));
  const rows = await getDb().query.advanceRequests.findMany({
    where,
    orderBy: [desc(schema.advanceRequests.createdAt)],
    with: withRefs,
  });
  return rows.map(stripPersonalLinkedExpenses);
}

export async function getAdvance(familyId: number, id: number) {
  const row = await getDb().query.advanceRequests.findFirst({
    where: and(
      eq(schema.advanceRequests.id, id),
      eq(schema.advanceRequests.familyId, familyId),
    ),
    with: withRefs,
  });
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Advance request not found",
    });
  }
  return stripPersonalLinkedExpenses(row);
}

export async function createAdvance(data: {
  familyId: number;
  requesterId: number;
  approverId: number;
  amountCents: number;
  currency: string;
  purpose: string;
  neededByDate?: string;
}) {
  const [{ id }] = await getDb()
    .insert(schema.advanceRequests)
    .values({
      familyId: data.familyId,
      requesterId: data.requesterId,
      approverId: data.approverId,
      amountCents: data.amountCents,
      currency: data.currency,
      purpose: data.purpose,
      neededByDate: data.neededByDate ?? null,
    })
    .$returningId();
  return getAdvance(data.familyId, id);
}

export async function transitionAdvance(
  id: number,
  patch: Partial<
    Pick<
      schema.AdvanceRequest,
      "status" | "rejectReason" | "disbursedAt" | "returnedAmountCents"
    >
  >,
) {
  await getDb()
    .update(schema.advanceRequests)
    .set(patch)
    .where(eq(schema.advanceRequests.id, id));
}

/** Sum of shared expenses linked to this advance (receipts applied).
 *  Only valid posted/resolved expenses count — drafts, disputes and voided
 *  records must not reduce the outstanding remainder. */
export async function advanceReconciledCents(advanceId: number) {
  const rows = await getDb()
    .select({ total: sum(schema.expenses.amountCents) })
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.advanceId, advanceId),
        eq(schema.expenses.scope, "shared"),
        inArray(schema.expenses.status, [...RECONCILING_EXPENSE_STATUSES]),
      ),
    );
  return Number(rows.at(0)?.total ?? 0);
}

export async function createAdvanceReturn(data: {
  advanceId: number;
  amountCents: number;
  date: string;
  createdById: number;
}) {
  const [{ id }] = await getDb()
    .insert(schema.advanceReturns)
    .values({
      advanceId: data.advanceId,
      amountCents: data.amountCents,
      date: data.date,
      createdById: data.createdById,
    })
    .$returningId();
  return getDb().query.advanceReturns.findFirst({
    where: eq(schema.advanceReturns.id, id),
  });
}

export async function confirmAdvanceReturn(
  id: number,
  confirmedById: number,
) {
  await getDb()
    .update(schema.advanceReturns)
    .set({ status: "confirmed", confirmedById, confirmedAt: new Date() })
    .where(eq(schema.advanceReturns.id, id));
  return getDb().query.advanceReturns.findFirst({
    where: eq(schema.advanceReturns.id, id),
  });
}

/**
 * Confirm a pending remainder return and apply it to the advance's
 * returnedAmountCents atomically (single transaction).
 */
export async function confirmAdvanceReturnAndApply(data: {
  returnId: number;
  advanceId: number;
  confirmedById: number;
  newReturnedAmountCents: number;
}) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.advanceReturns)
      .set({
        status: "confirmed",
        confirmedById: data.confirmedById,
        confirmedAt: new Date(),
      })
      .where(eq(schema.advanceReturns.id, data.returnId));
    await tx
      .update(schema.advanceRequests)
      .set({ returnedAmountCents: data.newReturnedAmountCents })
      .where(eq(schema.advanceRequests.id, data.advanceId));
  });
  return db.query.advanceReturns.findFirst({
    where: eq(schema.advanceReturns.id, data.returnId),
  });
}

/** Open advances for a requester (used by the aging guard). */
export async function listOpenAdvancesFor(requesterId: number) {
  return getDb().query.advanceRequests.findMany({
    where: and(
      eq(schema.advanceRequests.requesterId, requesterId),
      inArray(schema.advanceRequests.status, [...OPEN_ADVANCE_STATUSES]),
    ),
  });
}
