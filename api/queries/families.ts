import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export type Membership = {
  family: schema.Family;
  membership: schema.FamilyMembership;
};

/** Returns the user's single family membership (MVP: one family per user). */
export async function getMembershipForUser(
  userId: number,
): Promise<Membership | null> {
  const db = getDb();
  const rows = await db
    .select({ membership: schema.familyMemberships, family: schema.families })
    .from(schema.familyMemberships)
    .innerJoin(
      schema.families,
      eq(schema.familyMemberships.familyId, schema.families.id),
    )
    .where(eq(schema.familyMemberships.userId, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

/** Like getMembershipForUser but throws if the user has no family yet. */
export async function requireMembership(userId: number): Promise<Membership> {
  const m = await getMembershipForUser(userId);
  if (!m) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "You must create or join a family first",
    });
  }
  return m;
}

/** The other member of a two-person family (used to pick approvers). */
export async function getPartner(
  familyId: number,
  userId: number,
): Promise<schema.FamilyMembership | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.familyMemberships)
    .where(eq(schema.familyMemberships.familyId, familyId));
  return rows.find((r) => r.userId !== userId) ?? null;
}

export async function listFamilyMembers(familyId: number) {
  const db = getDb();
  return db
    .select({
      membership: schema.familyMemberships,
      user: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatar: schema.users.avatar,
      },
    })
    .from(schema.familyMemberships)
    .innerJoin(
      schema.users,
      eq(schema.familyMemberships.userId, schema.users.id),
    )
    .where(eq(schema.familyMemberships.familyId, familyId));
}

export async function createFamily(params: {
  name: string;
  currency?: string;
  userId: number;
}) {
  const db = getDb();
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const [{ id }] = await db
    .insert(schema.families)
    .values({
      name: params.name,
      currency: params.currency ?? "EUR",
      inviteCode,
    })
    .$returningId();
  await db.insert(schema.familyMemberships).values({
    familyId: id,
    userId: params.userId,
    role: "owner",
  });
  return { familyId: id, inviteCode };
}

export async function joinFamilyByCode(inviteCode: string, userId: number) {
  const db = getDb();
  const family = await db.query.families.findFirst({
    where: eq(schema.families.inviteCode, inviteCode.toUpperCase()),
  });
  if (!family) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
  }
  const existing = await db.query.familyMemberships.findFirst({
    where: and(
      eq(schema.familyMemberships.familyId, family.id),
      eq(schema.familyMemberships.userId, userId),
    ),
  });
  if (existing) return family;
  await db.insert(schema.familyMemberships).values({
    familyId: family.id,
    userId,
    role: "member",
  });
  return family;
}

export async function updateFamilySettings(
  familyId: number,
  patch: Partial<Pick<schema.InsertFamily, "name" | "currency" | "advanceAgingWarnDays">>,
) {
  await getDb()
    .update(schema.families)
    .set(patch)
    .where(eq(schema.families.id, familyId));
  return getDb().query.families.findFirst({
    where: eq(schema.families.id, familyId),
  });
}
