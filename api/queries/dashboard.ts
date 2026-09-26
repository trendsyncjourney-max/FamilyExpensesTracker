import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";
import { listFamilyMembers } from "./families";
import { sharedMonthSpendNetCents, sharedSpendTotals } from "./expenses";
import { advanceReconciledCents } from "./advances";
import {
  advanceOutstandingCents,
  CLEARED_REIMBURSEMENT_STATUSES,
  computeNetOwedCents,
  OPEN_ADVANCE_STATUSES,
} from "../lib/money";

function monthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`,
  };
}

/**
 * Dashboard summary: net position between partners, month totals,
 * pending review counts, outstanding advances, upcoming projections.
 */
export async function getDashboardSummary(familyId: number, userId: number) {
  const db = getDb();
  const { from, to } = monthRange();

  const [members, spendTotals, monthSpendCents, pendingReimb, pendingAdvances, openAdvances, clearedReimbursements, upcoming] =
    await Promise.all([
      listFamilyMembers(familyId),
      sharedSpendTotals(familyId),
      // Month spending: the computed month range, net of confirmed refunds.
      sharedMonthSpendNetCents(familyId, from, to),
      db.query.reimbursementRequests.findMany({
        where: and(
          eq(schema.reimbursementRequests.familyId, familyId),
          eq(schema.reimbursementRequests.approverId, userId),
          eq(schema.reimbursementRequests.status, "submitted"),
        ),
      }),
      db.query.advanceRequests.findMany({
        where: and(
          eq(schema.advanceRequests.familyId, familyId),
          eq(schema.advanceRequests.approverId, userId),
          eq(schema.advanceRequests.status, "submitted"),
        ),
      }),
      db.query.advanceRequests.findMany({
        where: and(
          eq(schema.advanceRequests.familyId, familyId),
          inArray(schema.advanceRequests.status, [...OPEN_ADVANCE_STATUSES]),
        ),
      }),
      // Confirmed reimbursements shift the net position; `paid` is still
      // in-flight until the recipient confirms receipt.
      db.query.reimbursementRequests.findMany({
        where: and(
          eq(schema.reimbursementRequests.familyId, familyId),
          inArray(schema.reimbursementRequests.status, [
            ...CLEARED_REIMBURSEMENT_STATUSES,
          ]),
        ),
        columns: {
          id: true,
          requesterId: true,
          approverId: true,
          amountCents: true,
          status: true,
        },
      }),
      db.query.projectedExpenses.findMany({
        where: and(
          eq(schema.projectedExpenses.familyId, familyId),
          eq(schema.projectedExpenses.status, "planned"),
        ),
        orderBy: (t, { asc }) => [asc(t.dueDate)],
        limit: 10,
        with: { category: true },
      }),
    ]);

  // Net owed: fair share = half of joint shared spend (net of refunds).
  const totalByPayer = new Map(spendTotals.map((r) => [r.payerId, r.total]));
  const mySpent = totalByPayer.get(userId) ?? 0;
  const total = spendTotals.reduce((acc, r) => acc + r.total, 0);

  // Cleared reimbursements reduce who owes whom, per direction.
  const myReimbReceived = clearedReimbursements
    .filter((r) => r.requesterId === userId)
    .reduce((acc, r) => acc + r.amountCents, 0);
  const partnerReimbReceived = clearedReimbursements
    .filter((r) => r.requesterId !== userId)
    .reduce((acc, r) => acc + r.amountCents, 0);

  // Outstanding advances reduce what the family owes the requester
  // (advances are pre-payments from the family to the requester).
  const advanceOutstanding = await Promise.all(
    openAdvances.map(async (a) => ({
      advanceId: a.id,
      requesterId: a.requesterId,
      outstandingCents: advanceOutstandingCents(
        a.amountCents,
        await advanceReconciledCents(a.id),
        a.returnedAmountCents,
      ),
    })),
  );
  const myOutstanding = advanceOutstanding
    .filter((a) => a.requesterId === userId)
    .reduce((acc, a) => acc + a.outstandingCents, 0);
  const partnerOutstanding = advanceOutstanding
    .filter((a) => a.requesterId !== userId)
    .reduce((acc, a) => acc + a.outstandingCents, 0);

  const netOwedCents = computeNetOwedCents({
    mySpentCents: mySpent,
    totalSharedCents: total,
    myReimbReceivedCents: myReimbReceived,
    partnerReimbReceivedCents: partnerReimbReceived,
    myAdvanceOutstandingCents: myOutstanding,
    partnerAdvanceOutstandingCents: partnerOutstanding,
  });

  return {
    currency: "EUR",
    month: { from, to },
    sharedSpentMonthCents: monthSpendCents,
    mySharedSpentCents: mySpent,
    totalSharedSpentCents: total,
    netOwedCents: Math.round(netOwedCents),
    netDirection:
      netOwedCents > 0 ? ("owed_to_me" as const) : netOwedCents < 0 ? ("i_owe" as const) : ("settled" as const),
    pending: {
      reimbursementsToReview: pendingReimb.length,
      advancesToReview: pendingAdvances.length,
    },
    advanceOutstanding,
    upcomingProjections: upcoming,
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      avatar: m.user.avatar,
      role: m.membership.role,
    })),
  };
}
