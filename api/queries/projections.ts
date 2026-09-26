import { and, asc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function listProjections(
  familyId: number,
  opts?: { from?: string; to?: string },
) {
  const conditions = [eq(schema.projectedExpenses.familyId, familyId)];
  if (opts?.from) conditions.push(gte(schema.projectedExpenses.dueDate, opts.from));
  if (opts?.to) conditions.push(lte(schema.projectedExpenses.dueDate, opts.to));
  return getDb().query.projectedExpenses.findMany({
    where: and(...conditions),
    orderBy: [asc(schema.projectedExpenses.dueDate), asc(schema.projectedExpenses.id)],
    with: { category: true, realizedExpense: true },
  });
}

export async function getProjection(familyId: number, id: number) {
  const row = await getDb().query.projectedExpenses.findFirst({
    where: and(
      eq(schema.projectedExpenses.id, id),
      eq(schema.projectedExpenses.familyId, familyId),
    ),
    with: { category: true, realizedExpense: true },
  });
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Projected expense not found",
    });
  }
  return row;
}

export async function createProjection(data: {
  familyId: number;
  title: string;
  amountCents: number;
  currency: string;
  categoryId?: number;
  dueDate: string;
  recurrence?: "none" | "weekly" | "monthly" | "yearly";
  recurrenceUntil?: string;
  createdById: number;
}) {
  const [{ id }] = await getDb()
    .insert(schema.projectedExpenses)
    .values({
      familyId: data.familyId,
      title: data.title,
      amountCents: data.amountCents,
      currency: data.currency,
      categoryId: data.categoryId ?? null,
      dueDate: data.dueDate,
      recurrence: data.recurrence ?? "none",
      recurrenceUntil: data.recurrenceUntil ?? null,
      createdById: data.createdById,
    })
    .$returningId();
  return getProjection(data.familyId, id);
}

export async function updateProjection(
  id: number,
  patch: Partial<
    Pick<
      schema.ProjectedExpense,
      | "title"
      | "amountCents"
      | "currency"
      | "categoryId"
      | "dueDate"
      | "recurrence"
      | "recurrenceUntil"
      | "status"
      | "realizedExpenseId"
    >
  >,
) {
  await getDb()
    .update(schema.projectedExpenses)
    .set(patch)
    .where(eq(schema.projectedExpenses.id, id));
}
