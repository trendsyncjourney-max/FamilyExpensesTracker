import { and, desc, eq, inArray, or, gte, lte, sum } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "./connection";
import { effectivePayerId, netOfRefundsCents } from "../lib/money";

const withRefs = {
  payer: { columns: { id: true, name: true, avatar: true } },
  category: true,
  refunds: true,
} as const;

/** Shared expenses visible to every family member. */
export async function listSharedExpenses(
  familyId: number,
  opts?: { from?: string; to?: string; status?: schema.ExpenseStatus },
) {
  const conditions = [
    eq(schema.expenses.familyId, familyId),
    eq(schema.expenses.scope, "shared"),
  ];
  if (opts?.from) conditions.push(gte(schema.expenses.date, opts.from));
  if (opts?.to) conditions.push(lte(schema.expenses.date, opts.to));
  if (opts?.status) conditions.push(eq(schema.expenses.status, opts.status));
  return getDb().query.expenses.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.expenses.date), desc(schema.expenses.id)],
    with: withRefs,
  });
}

/** Personal expenses: hard isolation — only the owner can read these. */
export async function listPersonalExpenses(
  familyId: number,
  ownerId: number,
  opts?: { from?: string; to?: string },
) {
  const conditions = [
    eq(schema.expenses.familyId, familyId),
    eq(schema.expenses.scope, "personal"),
    eq(schema.expenses.ownerId, ownerId),
  ];
  if (opts?.from) conditions.push(gte(schema.expenses.date, opts.from));
  if (opts?.to) conditions.push(lte(schema.expenses.date, opts.to));
  return getDb().query.expenses.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.expenses.date), desc(schema.expenses.id)],
    with: withRefs,
  });
}

/**
 * Fetch an expense enforcing the isolation predicate:
 * family member AND (shared OR owner = me).
 */
export async function getAccessibleExpense(
  familyId: number,
  userId: number,
  id: number,
) {
  const row = await getDb().query.expenses.findFirst({
    where: and(
      eq(schema.expenses.id, id),
      eq(schema.expenses.familyId, familyId),
      or(
        eq(schema.expenses.scope, "shared"),
        eq(schema.expenses.ownerId, userId),
      ),
    ),
    with: withRefs,
  });
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
  }
  return row;
}

export async function createExpense(data: {
  familyId: number;
  scope: "shared" | "personal";
  ownerId: number;
  payerId: number;
  createdById: number;
  amountCents: number;
  currency: string;
  merchant?: string;
  date: string;
  categoryId?: number;
  notes?: string;
  status?: schema.ExpenseStatus;
  advanceId?: number;
  projectedExpenseId?: number;
  receiptUrl?: string;
  receiptKey?: string;
  receiptContentType?: string;
  receiptSizeBytes?: number;
}) {
  const [{ id }] = await getDb()
    .insert(schema.expenses)
    .values({
      familyId: data.familyId,
      scope: data.scope,
      ownerId: data.ownerId,
      payerId: data.payerId,
      createdById: data.createdById,
      amountCents: data.amountCents,
      currency: data.currency,
      merchant: data.merchant ?? null,
      date: data.date,
      categoryId: data.categoryId ?? null,
      notes: data.notes ?? null,
      status: data.status ?? "posted",
      advanceId: data.advanceId ?? null,
      projectedExpenseId: data.projectedExpenseId ?? null,
      receiptUrl: data.receiptUrl ?? null,
      receiptKey: data.receiptKey ?? null,
      receiptContentType: data.receiptContentType ?? null,
      receiptSizeBytes: data.receiptSizeBytes ?? null,
    })
    .$returningId();
  return getDb().query.expenses.findFirst({
    where: eq(schema.expenses.id, id),
    with: withRefs,
  });
}

export async function updateExpense(
  id: number,
  patch: Partial<
    Pick<
      schema.InsertExpense,
      | "amountCents"
      | "currency"
      | "merchant"
      | "date"
      | "categoryId"
      | "notes"
      | "status"
      | "returnStatus"
      | "receiptUrl"
      | "receiptKey"
      | "receiptContentType"
      | "receiptSizeBytes"
    >
  >,
) {
  await getDb()
    .update(schema.expenses)
    .set(patch)
    .where(eq(schema.expenses.id, id));
  return getDb().query.expenses.findFirst({
    where: eq(schema.expenses.id, id),
    with: withRefs,
  });
}

// --- Refunds / returns ------------------------------------------------------

export async function listRefundsForExpense(expenseId: number) {
  return getDb().query.refunds.findMany({
    where: eq(schema.refunds.expenseId, expenseId),
    orderBy: [desc(schema.refunds.date), desc(schema.refunds.id)],
  });
}

export async function createRefund(data: {
  expenseId: number;
  amountCents: number;
  date: string;
  method?: "cash" | "card" | "other";
  note?: string;
  createdById: number;
}) {
  const [{ id }] = await getDb()
    .insert(schema.refunds)
    .values({
      expenseId: data.expenseId,
      amountCents: data.amountCents,
      date: data.date,
      method: data.method ?? "card",
      note: data.note ?? null,
      createdById: data.createdById,
    })
    .$returningId();
  return getDb().query.refunds.findFirst({
    where: eq(schema.refunds.id, id),
  });
}

export async function totalRefundedCents(expenseId: number): Promise<number> {
  const rows = await getDb()
    .select({ total: sum(schema.refunds.amountCents) })
    .from(schema.refunds)
    .where(eq(schema.refunds.expenseId, expenseId));
  return Number(rows.at(0)?.total ?? 0);
}

/**
 * Insert a refund and update the expense's returnStatus atomically, so a
 * failure cannot leave the refund recorded without the status (or vice
 * versa).
 */
export async function createRefundAndUpdateStatus(data: {
  expenseId: number;
  amountCents: number;
  date: string;
  method?: "cash" | "card" | "other";
  note?: string;
  createdById: number;
  returnStatus: schema.ReturnStatus;
}) {
  const db = getDb();
  const refundId = await db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(schema.refunds)
      .values({
        expenseId: data.expenseId,
        amountCents: data.amountCents,
        date: data.date,
        method: data.method ?? "card",
        note: data.note ?? null,
        createdById: data.createdById,
      })
      .$returningId();
    await tx
      .update(schema.expenses)
      .set({ returnStatus: data.returnStatus })
      .where(eq(schema.expenses.id, data.expenseId));
    return id;
  });
  const refund = await db.query.refunds.findFirst({
    where: eq(schema.refunds.id, refundId),
  });
  const expense = await db.query.expenses.findFirst({
    where: eq(schema.expenses.id, data.expenseId),
    with: withRefs,
  });
  return { refund, expense };
}

/** Expense statuses that count toward shared balance math. */
const BALANCE_STATUSES = ["posted", "disputed", "resolved"] as const;

/**
 * Sum of shared expenses paid by each member for balance math,
 * net of confirmed refunds.
 *
 * Advance-funded shared expenses are credited to the advance provider
 * (the approver who disbursed the cash), not the requester who linked the
 * receipt — the requester was spending the provider's money.
 */
export async function sharedSpendTotals(familyId: number) {
  const db = getDb();
  const baseWhere = and(
    eq(schema.expenses.familyId, familyId),
    eq(schema.expenses.scope, "shared"),
    inArray(schema.expenses.status, [...BALANCE_STATUSES]),
  );
  const linkJoin = eq(schema.expenses.advanceId, schema.advanceRequests.id);
  const [expenseRows, refundRows] = await Promise.all([
    db
      .select({
        payerId: schema.expenses.payerId,
        advanceProviderId: schema.advanceRequests.approverId,
        amountCents: schema.expenses.amountCents,
      })
      .from(schema.expenses)
      .leftJoin(schema.advanceRequests, linkJoin)
      .where(baseWhere),
    db
      .select({
        payerId: schema.expenses.payerId,
        advanceProviderId: schema.advanceRequests.approverId,
        amountCents: schema.refunds.amountCents,
      })
      .from(schema.refunds)
      .innerJoin(
        schema.expenses,
        eq(schema.refunds.expenseId, schema.expenses.id),
      )
      .leftJoin(schema.advanceRequests, linkJoin)
      .where(baseWhere),
  ]);
  const spendByPayer = new Map<number, number>();
  for (const r of expenseRows) {
    const payer = effectivePayerId(r.payerId, r.advanceProviderId);
    spendByPayer.set(payer, (spendByPayer.get(payer) ?? 0) + r.amountCents);
  }
  const refundsByPayer = new Map<number, number>();
  for (const r of refundRows) {
    const payer = effectivePayerId(r.payerId, r.advanceProviderId);
    refundsByPayer.set(payer, (refundsByPayer.get(payer) ?? 0) + r.amountCents);
  }
  return [...spendByPayer.entries()].map(([payerId, total]) => ({
    payerId,
    total: netOfRefundsCents(total, refundsByPayer.get(payerId) ?? 0),
  }));
}

/**
 * Total shared spend within [from, to] (inclusive, YYYY-MM-DD),
 * net of confirmed refunds on those expenses.
 */
export async function sharedMonthSpendNetCents(
  familyId: number,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const baseWhere = and(
    eq(schema.expenses.familyId, familyId),
    eq(schema.expenses.scope, "shared"),
    eq(schema.expenses.status, "posted"),
    gte(schema.expenses.date, from),
    lte(schema.expenses.date, to),
  );
  const [spendRows, refundRows] = await Promise.all([
    db
      .select({ total: sum(schema.expenses.amountCents) })
      .from(schema.expenses)
      .where(baseWhere),
    db
      .select({ total: sum(schema.refunds.amountCents) })
      .from(schema.refunds)
      .innerJoin(
        schema.expenses,
        eq(schema.refunds.expenseId, schema.expenses.id),
      )
      .where(baseWhere),
  ]);
  return netOfRefundsCents(
    Number(spendRows.at(0)?.total ?? 0),
    Number(refundRows.at(0)?.total ?? 0),
  );
}
