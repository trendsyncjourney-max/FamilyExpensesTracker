import { and, asc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function listCategories(familyId: number, includeArchived = false) {
  const conditions = [eq(schema.categories.familyId, familyId)];
  if (!includeArchived) conditions.push(eq(schema.categories.archived, false));
  return getDb().query.categories.findMany({
    where: and(...conditions),
    orderBy: [asc(schema.categories.sortOrder), asc(schema.categories.name)],
  });
}

export async function createCategory(data: {
  familyId: number;
  name: string;
  icon?: string;
  scope?: "shared" | "personal" | "both";
  sortOrder?: number;
}) {
  const [{ id }] = await getDb()
    .insert(schema.categories)
    .values({
      familyId: data.familyId,
      name: data.name,
      icon: data.icon ?? null,
      scope: data.scope ?? "shared",
      sortOrder: data.sortOrder ?? 0,
    })
    .$returningId();
  return getDb().query.categories.findFirst({
    where: eq(schema.categories.id, id),
  });
}

export async function updateCategory(
  familyId: number,
  id: number,
  patch: Partial<{
    name: string;
    icon: string | null;
    scope: "shared" | "personal" | "both";
    sortOrder: number;
    archived: boolean;
  }>,
) {
  await getDb()
    .update(schema.categories)
    .set(patch)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.familyId, familyId),
      ),
    );
  return getDb().query.categories.findFirst({
    where: eq(schema.categories.id, id),
  });
}
