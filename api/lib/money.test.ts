import { describe, expect, it } from "vitest";
import {
  advanceOutstandingCents,
  CLEARED_REIMBURSEMENT_STATUSES,
  computeNetOwedCents,
  effectivePayerId,
  netOfRefundsCents,
} from "./money";

describe("CLEARED_REIMBURSEMENT_STATUSES", () => {
  it("only confirmed reimbursements clear the balance", () => {
    expect(CLEARED_REIMBURSEMENT_STATUSES).toEqual(["confirmed"]);
  });

  it("paid is still in-flight, not cleared", () => {
    expect(CLEARED_REIMBURSEMENT_STATUSES).not.toContain("paid");
  });
});

describe("netOfRefundsCents", () => {
  it("subtracts confirmed refunds from the expense amount", () => {
    expect(netOfRefundsCents(10_000, 2_500)).toBe(7_500);
  });

  it("returns the full amount when there are no refunds", () => {
    expect(netOfRefundsCents(10_000, 0)).toBe(10_000);
  });

  it("never goes negative when refunds exceed the amount", () => {
    expect(netOfRefundsCents(10_000, 12_000)).toBe(0);
  });

  it("treats a full refund as zero", () => {
    expect(netOfRefundsCents(10_000, 10_000)).toBe(0);
  });
});

describe("advanceOutstandingCents", () => {
  it("is the full amount before any reconciliation", () => {
    expect(advanceOutstandingCents(20_000, 0, 0)).toBe(20_000);
  });

  it("subtracts reconciled receipts and confirmed returns", () => {
    expect(advanceOutstandingCents(20_000, 12_000, 5_000)).toBe(3_000);
  });

  it("is zero once fully reconciled/returned", () => {
    expect(advanceOutstandingCents(20_000, 15_000, 5_000)).toBe(0);
  });

  it("never goes negative on over-confirmation", () => {
    expect(advanceOutstandingCents(20_000, 15_000, 10_000)).toBe(0);
  });
});

describe("computeNetOwedCents", () => {
  const base = {
    mySpentCents: 0,
    totalSharedCents: 0,
    myReimbReceivedCents: 0,
    partnerReimbReceivedCents: 0,
    myAdvanceOutstandingCents: 0,
    partnerAdvanceOutstandingCents: 0,
  };

  it("is settled when spending is evenly split", () => {
    expect(
      computeNetOwedCents({ ...base, mySpentCents: 5_000, totalSharedCents: 10_000 }),
    ).toBe(0);
  });

  it("is positive when I paid more than my fair share", () => {
    expect(
      computeNetOwedCents({ ...base, mySpentCents: 10_000, totalSharedCents: 10_000 }),
    ).toBe(5_000);
  });

  it("refund-netted totals reduce what is owed to me", () => {
    // I paid 10_000 gross, but 4_000 was refunded -> net spend 6_000.
    const net = netOfRefundsCents(10_000, 4_000);
    expect(
      computeNetOwedCents({ ...base, mySpentCents: net, totalSharedCents: net }),
    ).toBe(3_000);
  });

  it("a reimbursement I received reduces what the partner owes me", () => {
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        myReimbReceivedCents: 5_000,
      }),
    ).toBe(0);
  });

  it("a reimbursement I paid to the partner increases what they owe me", () => {
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        partnerReimbReceivedCents: 2_000,
      }),
    ).toBe(7_000);
  });

  it("reimbursements in both directions net out per direction", () => {
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        myReimbReceivedCents: 2_000,
        partnerReimbReceivedCents: 2_000,
      }),
    ).toBe(5_000);
  });

  it("my outstanding advance reduces what the family owes me", () => {
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        myAdvanceOutstandingCents: 3_000,
      }),
    ).toBe(2_000);
  });

  it("the partner's outstanding advance increases what they owe me", () => {
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        partnerAdvanceOutstandingCents: 3_000,
      }),
    ).toBe(8_000);
  });

  it("reconciled advance spend is not double counted", () => {
    // Advance of 10_000 fully reconciled into shared expenses I "paid":
    // outstanding is zero, and the spend counts once through the totals.
    const outstanding = advanceOutstandingCents(10_000, 10_000, 0);
    expect(
      computeNetOwedCents({
        ...base,
        mySpentCents: 10_000,
        totalSharedCents: 10_000,
        myAdvanceOutstandingCents: outstanding,
      }),
    ).toBe(5_000);
  });

  it("rounds odd fair shares to the nearest cent", () => {
    expect(
      computeNetOwedCents({ ...base, mySpentCents: 0, totalSharedCents: 101 }),
    ).toBe(-50);
  });
});

describe("effectivePayerId", () => {
  it("returns the expense payer when no advance is linked", () => {
    expect(effectivePayerId(1, null)).toBe(1);
    expect(effectivePayerId(1, undefined)).toBe(1);
  });

  it("returns the advance provider when a receipt is linked to an advance", () => {
    expect(effectivePayerId(1, 2)).toBe(2);
  });
});

describe("advance-funded shared expenses", () => {
  const base = {
    mySpentCents: 0,
    totalSharedCents: 0,
    myReimbReceivedCents: 0,
    partnerReimbReceivedCents: 0,
    myAdvanceOutstandingCents: 0,
    partnerAdvanceOutstandingCents: 0,
  };

  it("a fully reconciled advance receipt leaves the requester owing half", () => {
    // B (provider) gives A a €100 advance; A reconciles a €100 shared
    // receipt against it. The spend is credited to the provider, so at a
    // 50/50 split A owes B €50.
    const outstanding = advanceOutstandingCents(10_000, 10_000, 0);
    expect(outstanding).toBe(0);
    // From A's (requester) perspective: provider effectively paid 10_000.
    const requesterNet = computeNetOwedCents({
      ...base,
      mySpentCents: 0,
      totalSharedCents: 10_000,
      myAdvanceOutstandingCents: outstanding,
    });
    expect(requesterNet).toBe(-5_000); // A owes B €50
    // From B's (provider) perspective, the mirror image.
    const providerNet = computeNetOwedCents({
      ...base,
      mySpentCents: 10_000,
      totalSharedCents: 10_000,
      partnerAdvanceOutstandingCents: outstanding,
    });
    expect(providerNet).toBe(5_000); // B is owed €50
  });

  it("a partially reconciled advance does not double count", () => {
    // B gives A €100; A reconciles a €60 shared receipt. A owes B their
    // half of the shared spend (€30) plus the €40 cash still outstanding.
    const outstanding = advanceOutstandingCents(10_000, 6_000, 0);
    expect(outstanding).toBe(4_000);
    const requesterNet = computeNetOwedCents({
      ...base,
      mySpentCents: 0,
      totalSharedCents: 6_000,
      myAdvanceOutstandingCents: outstanding,
    });
    expect(requesterNet).toBe(-7_000); // €30 share + €40 outstanding
  });
});
