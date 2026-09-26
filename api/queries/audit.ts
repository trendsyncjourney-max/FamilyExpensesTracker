import { and, eq, ne, notInArray, or } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/** Append an entry to the append-only audit trail. Never updates/deletes. */
export async function writeAuditEvent(entry: {
  familyId: number | null;
  entityType: string;
  entityId: number;
  action: string;
  actorId: number;
  before?: unknown;
  after?: unknown;
}) {
  await getDb().insert(schema.auditEvents).values({
    familyId: entry.familyId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId,
    beforeJson: entry.before === undefined ? null : JSON.parse(JSON.stringify(entry.before)),
    afterJson: entry.after === undefined ? null : JSON.parse(JSON.stringify(entry.after)),
  });
}

export async function listAuditEvents(familyId: number, limit = 100) {
  const db = getDb();
  // Privacy: audit events for personal-scope expenses must never appear in
  // the family feed (even legacy rows written before familyId was nulled).
  const personalExpenseIds = (
    await db
      .select({ id: schema.expenses.id })
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.familyId, familyId),
          eq(schema.expenses.scope, "personal"),
        ),
      )
  ).map((r) => r.id);
  const conditions = [eq(schema.auditEvents.familyId, familyId)];
  if (personalExpenseIds.length > 0) {
    conditions.push(
      or(
        ne(schema.auditEvents.entityType, "expense"),
        notInArray(schema.auditEvents.entityId, personalExpenseIds),
      )!,
    );
  }
  return db.query.auditEvents.findMany({
    where: and(...conditions),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
    with: { actor: { columns: { id: true, name: true, avatar: true } } },
  });
}

export async function listAuditEventsForEntity(
  entityType: string,
  entityId: number,
) {
  return getDb().query.auditEvents.findMany({
    where: and(
      eq(schema.auditEvents.entityType, entityType),
      eq(schema.auditEvents.entityId, entityId),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    with: { actor: { columns: { id: true, name: true, avatar: true } } },
  });
}
