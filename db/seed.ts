import { and, eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import * as schema from "./schema";

/**
 * Seed data demonstrating the Hearth workflows:
 * - family "The Ember Household" with two members (Mia & Leo)
 * - shared + personal expenses, a refund/return
 * - a confirmed reimbursement request (full two-sided clearing loop)
 * - an advance that is disbursed and partially reconciled via a linked
 *   receipt plus a confirmed remainder return
 * - projected expenses (one-off + recurring), notifications, audit events
 *
 * Idempotent: safe to re-run; skips when the demo family already exists.
 */

const DEMO_INVITE = "HEARTHDEMO";
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const daysAhead = (n: number) =>
  new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

async function upsertDemoUser(unionId: string, name: string, email: string) {
  const db = getDb();
  await db
    .insert(schema.users)
    .values({ unionId, name, email })
    .onDuplicateKeyUpdate({ set: { name, email } });
  const user = await db.query.users.findFirst({
    where: eq(schema.users.unionId, unionId),
  });
  if (!user) throw new Error(`Failed to upsert user ${unionId}`);
  return user;
}

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  const mia = await upsertDemoUser("seed-mia", "Mia", "mia@hearth.demo");
  const leo = await upsertDemoUser("seed-leo", "Leo", "leo@hearth.demo");

  const existing = await db.query.families.findFirst({
    where: eq(schema.families.inviteCode, DEMO_INVITE),
  });
  if (existing) {
    console.log("Demo family already exists — skipping.");
    process.exit(0);
  }

  const [{ id: familyId }] = await db
    .insert(schema.families)
    .values({ name: "The Ember Household", inviteCode: DEMO_INVITE, currency: "EUR" })
    .$returningId();

  await db.insert(schema.familyMemberships).values([
    { familyId, userId: mia.id, role: "owner" },
    { familyId, userId: leo.id, role: "member" },
  ]);

  const catDefs = [
    { name: "Groceries", icon: "shopping-cart" },
    { name: "Dining", icon: "utensils" },
    { name: "Housing", icon: "home" },
    { name: "Transport", icon: "car" },
    { name: "Utilities", icon: "plug" },
    { name: "Leisure", icon: "ticket" },
  ];
  const [{ id: firstCatId }] = await db
    .insert(schema.categories)
    .values(
      catDefs.map((c, i) => ({
        familyId,
        name: c.name,
        icon: c.icon,
        scope: "both" as const,
        sortOrder: i,
      })),
    )
    .$returningId();
  const [groceries, dining, housing, transport, utilities, leisure] =
    catDefs.map((_, i) => firstCatId + i);

  // --- Shared expenses (posted) --------------------------------------------
  const [{ id: exp1 }] = await db
    .insert(schema.expenses)
    .values({
      familyId, scope: "shared", ownerId: mia.id, payerId: mia.id, createdById: mia.id,
      amountCents: 8640, currency: "EUR", merchant: "Mercadona",
      date: daysAgo(6), categoryId: groceries, notes: "Weekly groceries",
      status: "posted",
    })
    .$returningId();
  const [{ id: exp2 }] = await db
    .insert(schema.expenses)
    .values({
      familyId, scope: "shared", ownerId: leo.id, payerId: leo.id, createdById: leo.id,
      amountCents: 4200, currency: "EUR", merchant: "Casa Luca",
      date: daysAgo(4), categoryId: dining, notes: "Anniversary dinner",
      status: "posted",
    })
    .$returningId();
  const [{ id: exp3 }] = await db
    .insert(schema.expenses)
    .values({
      familyId, scope: "shared", ownerId: mia.id, payerId: mia.id, createdById: mia.id,
      amountCents: 5999, currency: "EUR", merchant: "IKEA",
      date: daysAgo(2), categoryId: housing, notes: "Desk lamp — might return",
      status: "posted", returnStatus: "partially_refunded",
      receiptUrl: "/receipts/demo-ikea.png", receiptContentType: "image/png",
    })
    .$returningId();

  // Draft + disputed to show status variety
  await db.insert(schema.expenses).values([
    {
      familyId, scope: "shared", ownerId: leo.id, payerId: leo.id, createdById: leo.id,
      amountCents: 1850, currency: "EUR", merchant: "Metro",
      date: today(), categoryId: transport, status: "draft",
    },
    {
      familyId, scope: "shared", ownerId: mia.id, payerId: mia.id, createdById: mia.id,
      amountCents: 7400, currency: "EUR", merchant: "Cinema + snacks",
      date: daysAgo(1), categoryId: leisure, status: "disputed",
      notes: "Leo: was the popcorn really €12?",
    },
  ]);

  // --- Personal expenses (isolated per owner) -------------------------------
  await db.insert(schema.expenses).values([
    {
      familyId, scope: "personal", ownerId: mia.id, payerId: mia.id, createdById: mia.id,
      amountCents: 2400, currency: "EUR", merchant: "Bookshop",
      date: daysAgo(3), notes: "Gift for mom — private",
    },
    {
      familyId, scope: "personal", ownerId: leo.id, payerId: leo.id, createdById: leo.id,
      amountCents: 4999, currency: "EUR", merchant: "Steam",
      date: daysAgo(5),
    },
  ]);

  // --- Refund / return on the IKEA lamp -------------------------------------
  await db.insert(schema.refunds).values({
    expenseId: exp3, amountCents: 2000, date: daysAgo(1),
    method: "card", note: "Partial refund — wrong bulb included",
    createdById: mia.id,
  });

  // --- Reimbursement request: full loop to confirmed -------------------------
  const [{ id: reimbId }] = await db
    .insert(schema.reimbursementRequests)
    .values({
      familyId, requesterId: mia.id, approverId: leo.id,
      amountCents: 4320, currency: "EUR",
      note: "Half of the Mercadona run",
      status: "confirmed",
      respondedAt: new Date(Date.now() - 5 * 86400_000),
      paidAt: new Date(Date.now() - 4 * 86400_000),
      confirmedAt: new Date(Date.now() - 3 * 86400_000),
    })
    .$returningId();
  await db.insert(schema.reimbursementItems).values({
    requestId: reimbId, expenseId: exp1, amountCents: 4320,
    note: "50% of groceries",
  });

  // A pending one waiting on Leo's inbox
  const [{ id: reimb2 }] = await db
    .insert(schema.reimbursementRequests)
    .values({
      familyId, requesterId: leo.id, approverId: mia.id,
      amountCents: 2100, currency: "EUR", note: "Half the dinner",
      status: "submitted",
    })
    .$returningId();
  await db.insert(schema.reimbursementItems).values({
    requestId: reimb2, expenseId: exp2, amountCents: 2100,
  });

  // --- Advance: disbursed, partially reconciled, remainder returned ----------
  const [{ id: advId }] = await db
    .insert(schema.advanceRequests)
    .values({
      familyId, requesterId: leo.id, approverId: mia.id,
      amountCents: 30000, currency: "EUR", purpose: "Weekend market run",
      neededByDate: daysAgo(3), status: "reconciling",
      disbursedAt: new Date(Date.now() - 4 * 86400_000),
      returnedAmountCents: 5000,
    })
    .$returningId();
  // Receipt applied against the advance (reduces outstanding).
  await db.insert(schema.expenses).values({
    familyId, scope: "shared", ownerId: leo.id, payerId: leo.id, createdById: leo.id,
    amountCents: 21500, currency: "EUR", merchant: "Mercat Central",
    date: daysAgo(2), categoryId: groceries, status: "posted",
    advanceId: advId, notes: "Paid from the advance",
  });
  await db.insert(schema.advanceReturns).values({
    advanceId: advId, amountCents: 5000, date: daysAgo(1),
    status: "confirmed", createdById: leo.id, confirmedById: mia.id,
    confirmedAt: new Date(Date.now() - 86400_000),
  });

  // A fresh advance request waiting in Mia's inbox
  await db.insert(schema.advanceRequests).values({
    familyId, requesterId: mia.id, approverId: leo.id,
    amountCents: 15000, currency: "EUR", purpose: "Plumber deposit",
    neededByDate: daysAhead(2), status: "submitted",
  });

  // --- Projected expenses ----------------------------------------------------
  await db.insert(schema.projectedExpenses).values([
    {
      familyId, title: "Rent", amountCents: 120000, currency: "EUR",
      categoryId: housing, dueDate: daysAhead(5), recurrence: "monthly",
      createdById: mia.id,
    },
    {
      familyId, title: "Electricity", amountCents: 6500, currency: "EUR",
      categoryId: utilities, dueDate: daysAhead(9), recurrence: "monthly",
      createdById: leo.id,
    },
    {
      familyId, title: "Streaming bundle", amountCents: 1799, currency: "EUR",
      categoryId: leisure, dueDate: daysAhead(12), recurrence: "monthly",
      createdById: leo.id,
    },
    {
      familyId, title: "Flight to Lisbon", amountCents: 24000, currency: "EUR",
      dueDate: daysAhead(30), recurrence: "none", createdById: mia.id,
      status: "realized", realizedExpenseId: exp2,
    },
  ]);

  // --- Notifications ---------------------------------------------------------
  await db.insert(schema.notifications).values([
    {
      userId: mia.id, familyId, type: "request_pending",
      title: "New reimbursement request",
      body: "Leo requested €21.00 — half the dinner",
      payload: { requestId: reimb2 },
    },
    {
      userId: leo.id, familyId, type: "request_pending",
      title: "New advance request",
      body: "Mia requested an advance: Plumber deposit",
      payload: {},
    },
    {
      userId: mia.id, familyId, type: "return_update",
      title: "Refund recorded",
      body: "€20.00 refunded for IKEA",
      payload: { expenseId: exp3 }, readAt: new Date(),
    },
  ]);

  // --- Audit events ----------------------------------------------------------
  await db.insert(schema.auditEvents).values([
    {
      familyId, entityType: "family", entityId: familyId, action: "created",
      actorId: mia.id, afterJson: { name: "The Ember Household" },
    },
    {
      familyId, entityType: "expense", entityId: exp1, action: "created",
      actorId: mia.id, afterJson: { merchant: "Mercadona", amountCents: 8640 },
    },
    {
      familyId, entityType: "expense", entityId: exp3, action: "refund_added",
      actorId: mia.id, afterJson: { amountCents: 2000, returnStatus: "partially_refunded" },
    },
    {
      familyId, entityType: "reimbursement_request", entityId: reimbId,
      action: "confirmed", actorId: mia.id,
      beforeJson: { status: "paid" }, afterJson: { status: "confirmed" },
    },
    {
      familyId, entityType: "advance_request", entityId: advId,
      action: "disbursed", actorId: mia.id,
      beforeJson: { status: "approved" }, afterJson: { status: "disbursed" },
    },
  ]);

  console.log("Done. Demo family invite code:", DEMO_INVITE);
  process.exit(0); // close MySQL connection pool
}

seed();
