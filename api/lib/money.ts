/**
 * Pure money/state helpers for Hearth accounting.
 *
 * All amounts are integer cents. These helpers are dependency-free so they
 * can be unit-tested without a database and reused by the query layer.
 */

/** An expense's effective cost after confirmed refunds (never negative). */
export function netOfRefundsCents(amountCents: number, refundedCents: number): number {
  return Math.max(0, amountCents - Math.max(0, refundedCents));
}

/**
 * Reimbursement statuses in which money has actually cleared.
 * `paid` is still in-flight: the payer marked it sent, but the balance only
 * shifts once the recipient confirms receipt.
 */
export const CLEARED_REIMBURSEMENT_STATUSES = ["confirmed"] as const;

/** Expense statuses that count toward advance reconciliation. */
export const RECONCILING_EXPENSE_STATUSES = ["posted", "resolved"] as const;

/** Advance statuses that are still open (money disbursed, not reconciled). */
export const OPEN_ADVANCE_STATUSES = ["disbursed", "reconciling"] as const;

/**
 * Outstanding cash on an advance: what was disbursed minus reconciled
 * receipts minus confirmed remainder returns (never negative).
 */
export function advanceOutstandingCents(
  amountCents: number,
  reconciledCents: number,
  returnedCents: number,
): number {
  return Math.max(
    0,
    amountCents - Math.max(0, reconciledCents) - Math.max(0, returnedCents),
  );
}

/**
 * Effective payer of an expense for balance purposes.
 *
 * When a shared expense is linked to an advance, the advance provider
 * (approver) funded the money, so economically the provider — not the
 * requester who handed over the receipt — paid for it. Linking the receipt
 * merely reconciles the advance; it must not move the balance toward the
 * requester.
 */
export function effectivePayerId(
  expensePayerId: number,
  advanceProviderId: number | null | undefined,
): number {
  return advanceProviderId ?? expensePayerId;
}

export interface NetPositionInput {
  /** Shared spend (net of refunds) paid by the current user. */
  mySpentCents: number;
  /** Total shared spend (net of refunds) across the family. */
  totalSharedCents: number;
  /** Cleared reimbursements the current user received from the partner. */
  myReimbReceivedCents: number;
  /** Cleared reimbursements the partner received from the current user. */
  partnerReimbReceivedCents: number;
  /** Outstanding advances the current user still owes back to the family. */
  myAdvanceOutstandingCents: number;
  /** Outstanding advances the partner still owes back to the family. */
  partnerAdvanceOutstandingCents: number;
}

/**
 * Net position between two partners, in cents.
 * Positive => the partner (family) owes me; negative => I owe the partner.
 *
 * - Fair share of shared spend is half each.
 * - A cleared reimbursement I received reduces what the partner owes me
 *   (and vice versa) — applied exactly once per direction.
 * - Outstanding advances are family money pre-paid to the requester: my
 *   outstanding advances reduce what the family owes me, the partner's
 *   outstanding advances increase it. Reconciled/returned portions are
 *   already excluded by `advanceOutstandingCents`, so there is no double
 *   counting with linked expenses.
 */
export function computeNetOwedCents(input: NetPositionInput): number {
  const fairShare = input.totalSharedCents / 2;
  const net =
    input.mySpentCents -
    fairShare -
    Math.max(0, input.myReimbReceivedCents) +
    Math.max(0, input.partnerReimbReceivedCents) -
    Math.max(0, input.myAdvanceOutstandingCents) +
    Math.max(0, input.partnerAdvanceOutstandingCents);
  return Math.round(net);
}
