import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  mediumtext,
  timestamp,
  bigint,
  int,
  boolean,
  date,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// Hearth domain
//
// Conventions:
// - All FK columns referencing a serial() PK use bigint(mode: "number",
//   unsigned: true) to match `bigint unsigned auto_increment`.
// - All money is stored as integer cents in `int` columns (no floats ever).
// - Hard privacy isolation: rows carry familyId + scope. "shared" rows are
//   visible to family members; "personal" rows only to their ownerId.
// ---------------------------------------------------------------------------

export const families = mysqlTable("families", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
  advanceAgingWarnDays: int("advanceAgingWarnDays").default(14).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Family = typeof families.$inferSelect;
export type InsertFamily = typeof families.$inferInsert;

export const familyMemberships = mysqlTable(
  "family_memberships",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    role: mysqlEnum("role", ["owner", "member"]).default("member").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("family_user_unique").on(table.familyId, table.userId),
    index("membership_user_idx").on(table.userId),
  ],
);

export type FamilyMembership = typeof familyMemberships.$inferSelect;

export const categories = mysqlTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    name: varchar("name", { length: 128 }).notNull(),
    icon: varchar("icon", { length: 64 }),
    scope: mysqlEnum("scope", ["shared", "personal", "both"])
      .default("shared")
      .notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("category_family_idx").on(table.familyId)],
);

export type Category = typeof categories.$inferSelect;

export const expenseStatusValues = [
  "draft",
  "posted",
  "disputed",
  "resolved",
  "voided",
] as const;
export type ExpenseStatus = (typeof expenseStatusValues)[number];

export const returnStatusValues = [
  "none",
  "return_initiated",
  "partially_refunded",
  "fully_refunded",
  "return_rejected",
] as const;
export type ReturnStatus = (typeof returnStatusValues)[number];

export const expenses = mysqlTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    scope: mysqlEnum("scope", ["shared", "personal"]).notNull(),
    // Owner of the record; for personal scope this is the only viewer.
    ownerId: bigint("ownerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    payerId: bigint("payerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdById: bigint("createdById", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    merchant: varchar("merchant", { length: 255 }),
    date: date("date", { mode: "string" }).notNull(),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true })
      .references(() => categories.id),
    notes: text("notes"),
    status: mysqlEnum("status", expenseStatusValues)
      .default("posted")
      .notNull(),
    returnStatus: mysqlEnum("returnStatus", returnStatusValues)
      .default("none")
      .notNull(),
    // Set when this expense reconciles an advance request.
    advanceId: bigint("advanceId", { mode: "number", unsigned: true }),
    // Set when this expense realizes a projected expense.
    projectedExpenseId: bigint("projectedExpenseId", {
      mode: "number",
      unsigned: true,
    }),
    // Receipt attachment. No object storage is provisioned, so receipt
    // photos are stored inline as data URLs — MEDIUMTEXT (16 MiB) gives
    // real headroom; the app enforces its own lower cap.
    receiptUrl: mediumtext("receiptUrl"),
    receiptKey: varchar("receiptKey", { length: 512 }),
    receiptContentType: varchar("receiptContentType", { length: 128 }),
    receiptSizeBytes: int("receiptSizeBytes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("expense_family_date_idx").on(table.familyId, table.date),
    index("expense_family_status_idx").on(table.familyId, table.status),
    index("expense_owner_idx").on(table.ownerId),
    index("expense_advance_idx").on(table.advanceId),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

export const refunds = mysqlTable(
  "refunds",
  {
    id: serial("id").primaryKey(),
    expenseId: bigint("expenseId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => expenses.id),
    amountCents: int("amountCents").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    method: mysqlEnum("method", ["cash", "card", "other"])
      .default("card")
      .notNull(),
    note: text("note"),
    createdById: bigint("createdById", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("refund_expense_idx").on(table.expenseId)],
);

export type Refund = typeof refunds.$inferSelect;

export const reimbursementStatusValues = [
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "paid",
  "confirmed",
] as const;
export type ReimbursementStatus = (typeof reimbursementStatusValues)[number];

export const reimbursementRequests = mysqlTable(
  "reimbursement_requests",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    requesterId: bigint("requesterId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    approverId: bigint("approverId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    note: text("note"),
    status: mysqlEnum("status", reimbursementStatusValues)
      .default("submitted")
      .notNull(),
    rejectReason: text("rejectReason"),
    respondedAt: timestamp("respondedAt"),
    paidAt: timestamp("paidAt"),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("reimb_approver_idx").on(table.familyId, table.approverId, table.status),
    index("reimb_requester_idx").on(table.requesterId),
  ],
);

export type ReimbursementRequest = typeof reimbursementRequests.$inferSelect;

export const reimbursementItems = mysqlTable(
  "reimbursement_items",
  {
    id: serial("id").primaryKey(),
    requestId: bigint("requestId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => reimbursementRequests.id),
    expenseId: bigint("expenseId", { mode: "number", unsigned: true })
      .references(() => expenses.id),
    amountCents: int("amountCents").notNull(),
    note: varchar("note", { length: 255 }),
  },
  (table) => [index("reimb_item_request_idx").on(table.requestId)],
);

export type ReimbursementItem = typeof reimbursementItems.$inferSelect;

export const advanceStatusValues = [
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "disbursed",
  "reconciling",
  "reconciled",
] as const;
export type AdvanceStatus = (typeof advanceStatusValues)[number];

export const advanceRequests = mysqlTable(
  "advance_requests",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    requesterId: bigint("requesterId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    approverId: bigint("approverId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    purpose: varchar("purpose", { length: 255 }).notNull(),
    neededByDate: date("neededByDate", { mode: "string" }),
    status: mysqlEnum("status", advanceStatusValues)
      .default("submitted")
      .notNull(),
    rejectReason: text("rejectReason"),
    disbursedAt: timestamp("disbursedAt"),
    // Cumulative confirmed remainder returns (integer cents).
    returnedAmountCents: int("returnedAmountCents").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("advance_approver_idx").on(table.familyId, table.approverId, table.status),
    index("advance_requester_idx").on(table.requesterId),
  ],
);

export type AdvanceRequest = typeof advanceRequests.$inferSelect;

export const advanceReturns = mysqlTable(
  "advance_returns",
  {
    id: serial("id").primaryKey(),
    advanceId: bigint("advanceId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => advanceRequests.id),
    amountCents: int("amountCents").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["pending_confirm", "confirmed"])
      .default("pending_confirm")
      .notNull(),
    createdById: bigint("createdById", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    confirmedById: bigint("confirmedById", { mode: "number", unsigned: true })
      .references(() => users.id),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("advance_return_idx").on(table.advanceId)],
);

export type AdvanceReturn = typeof advanceReturns.$inferSelect;

export const projectedExpenses = mysqlTable(
  "projected_expenses",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => families.id),
    title: varchar("title", { length: 255 }).notNull(),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    categoryId: bigint("categoryId", { mode: "number", unsigned: true })
      .references(() => categories.id),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    recurrence: mysqlEnum("recurrence", ["none", "weekly", "monthly", "yearly"])
      .default("none")
      .notNull(),
    recurrenceUntil: date("recurrenceUntil", { mode: "string" }),
    status: mysqlEnum("status", ["planned", "realized", "skipped"])
      .default("planned")
      .notNull(),
    realizedExpenseId: bigint("realizedExpenseId", {
      mode: "number",
      unsigned: true,
    }).references(() => expenses.id),
    createdById: bigint("createdById", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("projected_family_due_idx").on(table.familyId, table.dueDate),
  ],
);

export type ProjectedExpense = typeof projectedExpenses.$inferSelect;

export const notifications = mysqlTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .references(() => families.id),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    payload: json("payload"),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("notification_user_idx").on(table.userId, table.readAt)],
);

export type Notification = typeof notifications.$inferSelect;

// Append-only audit trail. Never update or delete rows.
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    familyId: bigint("familyId", { mode: "number", unsigned: true })
      .references(() => families.id),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    entityId: bigint("entityId", { mode: "number", unsigned: true }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    actorId: bigint("actorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    beforeJson: json("beforeJson"),
    afterJson: json("afterJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("audit_family_idx").on(table.familyId, table.createdAt),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
