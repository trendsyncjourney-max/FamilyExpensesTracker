import { relations } from "drizzle-orm";
import {
  users,
  families,
  familyMemberships,
  categories,
  expenses,
  refunds,
  reimbursementRequests,
  reimbursementItems,
  advanceRequests,
  advanceReturns,
  projectedExpenses,
  notifications,
  auditEvents,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(familyMemberships),
  notifications: many(notifications),
}));

export const familiesRelations = relations(families, ({ many }) => ({
  memberships: many(familyMemberships),
  categories: many(categories),
  expenses: many(expenses),
  reimbursementRequests: many(reimbursementRequests),
  advanceRequests: many(advanceRequests),
  projectedExpenses: many(projectedExpenses),
  auditEvents: many(auditEvents),
}));

export const familyMembershipsRelations = relations(
  familyMemberships,
  ({ one }) => ({
    family: one(families, {
      fields: [familyMemberships.familyId],
      references: [families.id],
    }),
    user: one(users, {
      fields: [familyMemberships.userId],
      references: [users.id],
    }),
  }),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  family: one(families, {
    fields: [categories.familyId],
    references: [families.id],
  }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  family: one(families, {
    fields: [expenses.familyId],
    references: [families.id],
  }),
  owner: one(users, { fields: [expenses.ownerId], references: [users.id] }),
  payer: one(users, { fields: [expenses.payerId], references: [users.id] }),
  category: one(categories, {
    fields: [expenses.categoryId],
    references: [categories.id],
  }),
  advance: one(advanceRequests, {
    fields: [expenses.advanceId],
    references: [advanceRequests.id],
  }),
  refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  expense: one(expenses, {
    fields: [refunds.expenseId],
    references: [expenses.id],
  }),
  createdBy: one(users, {
    fields: [refunds.createdById],
    references: [users.id],
  }),
}));

export const reimbursementRequestsRelations = relations(
  reimbursementRequests,
  ({ one, many }) => ({
    family: one(families, {
      fields: [reimbursementRequests.familyId],
      references: [families.id],
    }),
    requester: one(users, {
      fields: [reimbursementRequests.requesterId],
      references: [users.id],
    }),
    approver: one(users, {
      fields: [reimbursementRequests.approverId],
      references: [users.id],
    }),
    items: many(reimbursementItems),
  }),
);

export const reimbursementItemsRelations = relations(
  reimbursementItems,
  ({ one }) => ({
    request: one(reimbursementRequests, {
      fields: [reimbursementItems.requestId],
      references: [reimbursementRequests.id],
    }),
    expense: one(expenses, {
      fields: [reimbursementItems.expenseId],
      references: [expenses.id],
    }),
  }),
);

export const advanceRequestsRelations = relations(
  advanceRequests,
  ({ one, many }) => ({
    family: one(families, {
      fields: [advanceRequests.familyId],
      references: [families.id],
    }),
    requester: one(users, {
      fields: [advanceRequests.requesterId],
      references: [users.id],
    }),
    approver: one(users, {
      fields: [advanceRequests.approverId],
      references: [users.id],
    }),
    linkedExpenses: many(expenses),
    returns: many(advanceReturns),
  }),
);

export const advanceReturnsRelations = relations(advanceReturns, ({ one }) => ({
  advance: one(advanceRequests, {
    fields: [advanceReturns.advanceId],
    references: [advanceRequests.id],
  }),
  createdBy: one(users, {
    fields: [advanceReturns.createdById],
    references: [users.id],
  }),
}));

export const projectedExpensesRelations = relations(
  projectedExpenses,
  ({ one }) => ({
    family: one(families, {
      fields: [projectedExpenses.familyId],
      references: [families.id],
    }),
    category: one(categories, {
      fields: [projectedExpenses.categoryId],
      references: [categories.id],
    }),
    realizedExpense: one(expenses, {
      fields: [projectedExpenses.realizedExpenseId],
      references: [expenses.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  family: one(families, {
    fields: [notifications.familyId],
    references: [families.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  family: one(families, {
    fields: [auditEvents.familyId],
    references: [families.id],
  }),
  actor: one(users, { fields: [auditEvents.actorId], references: [users.id] }),
}));
