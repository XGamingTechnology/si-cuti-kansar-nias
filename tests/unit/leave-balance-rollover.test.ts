import { describe, expect, it } from "vitest";
import {
  calculateAnnualRollover,
  deriveN2WasUsed,
  deriveNetAnnualLeaveUsageDays,
  LeaveBalancePolicyError,
} from "@/domain/leave-balance";

const calculate = (
  overrides: Partial<
    Parameters<typeof calculateAnnualRollover>[0]
  > = {},
) =>
  calculateAnnualRollover({
    previousYearNRemaining: 0,
    previousYearCommittedAnnualLeaveDays: 0,
    twoYearsAgoCommittedAnnualLeaveDays: 0,
    currentN2Remaining: 0,
    currentN2WasUsed: false,
    firstQualifyingYear: 2024,
    secondQualifyingYear: 2025,
    consumedQualifyingPeriods: [],
    ...overrides,
  });

describe("deriveNetAnnualLeaveUsageDays", () => {
  it("returns zero after a full authorized reversal", () => {
    expect(
      deriveNetAnnualLeaveUsageDays({ committedDays: 4, reversedDays: 4 }),
    ).toBe(0);
  });

  it("keeps positive effective usage after a partial reversal", () => {
    expect(
      deriveNetAnnualLeaveUsageDays({ committedDays: 4, reversedDays: 1 }),
    ).toBe(3);
  });

  it("rejects reversal above committed annual leave", () => {
    expect(() =>
      deriveNetAnnualLeaveUsageDays({ committedDays: 1, reversedDays: 2 }),
    ).toThrowError(LeaveBalancePolicyError);
  });
});

describe("deriveN2WasUsed", () => {
  it("treats a fully reversed N2 commitment as unused", () => {
    expect(deriveN2WasUsed({ committedDays: 2, reversedDays: 2 })).toBe(false);
  });

  it("treats remaining net N2 commitment as used", () => {
    expect(deriveN2WasUsed({ committedDays: 4, reversedDays: 2 })).toBe(true);
  });

  it("treats zero N2 commitment as unused", () => {
    expect(deriveN2WasUsed({ committedDays: 0, reversedDays: 0 })).toBe(false);
  });

  it("rejects reversal above committed N2 days", () => {
    expect(() =>
      deriveN2WasUsed({ committedDays: 1, reversedDays: 2 }),
    ).toThrowError(LeaveBalancePolicyError);
  });
});

describe("calculateAnnualRollover", () => {
  it.each([
    [4, 4],
    [9, 6],
    [0, 0],
  ])("caps previous N %s as N1 %s", (value, expected) => {
    expect(calculate({ previousYearNRemaining: value }).n1).toBe(expected);
  });

  it("grants six N2 days after two zero-usage years when no active N2 exists", () => {
    expect(calculate()).toMatchObject({
      n: 12,
      n2: 6,
      n2GrantedDays: 6,
      n2ExpiredDays: 0,
    });
  });

  it("carries an unused active N2 without topping it up from a new qualifying pair", () => {
    expect(calculate({ currentN2Remaining: 4, currentN2WasUsed: false })).toMatchObject({
      n2: 4,
      n2GrantedDays: 0,
      n2ExpiredDays: 0,
    });
  });

  it("carries the full unused N2 entitlement into the next year", () => {
    expect(calculate({ currentN2Remaining: 6, currentN2WasUsed: false })).toMatchObject({
      n2: 6,
      n2GrantedDays: 0,
      n2ExpiredDays: 0,
    });
  });

  it("expires the remainder at rollover after N2 was used during the year", () => {
    expect(
      calculate({
        currentN2Remaining: 4,
        currentN2WasUsed: true,
        previousYearCommittedAnnualLeaveDays: 2,
      }),
    ).toMatchObject({
      n2: 0,
      n2GrantedDays: 0,
      n2ExpiredDays: 4,
    });
  });

  it("does not reuse the same qualifying period after its entitlement was issued", () => {
    expect(calculate({ consumedQualifyingPeriods: ["2024:2025"] })).toMatchObject({
      n2: 0,
      n2GrantedDays: 0,
      n2ExpiredDays: 0,
    });
  });

  it("allows a new independently tracked two-year period to grant N2 after no active entitlement remains", () => {
    expect(
      calculate({
        firstQualifyingYear: 2026,
        secondQualifyingYear: 2027,
        consumedQualifyingPeriods: ["2024:2025"],
      }),
    ).toMatchObject({ n2: 6, n2GrantedDays: 6, n2ExpiredDays: 0 });
  });

  it.each([
    [1, 0],
    [0, 1],
  ])("does not grant N2 with committed usage %s/%s", (previous, older) => {
    expect(
      calculate({
        previousYearCommittedAnnualLeaveDays: previous,
        twoYearsAgoCommittedAnnualLeaveDays: older,
      }).n2GrantedDays,
    ).toBe(0);
  });

  it.each([
    { previousYearNRemaining: -1 },
    { currentN2Remaining: 7 },
    { previousYearCommittedAnnualLeaveDays: 0.5 },
  ])(
    "rejects invalid whole-day input $previousYearNRemaining$currentN2Remaining$previousYearCommittedAnnualLeaveDays",
    (input) =>
      expect(() => calculate(input)).toThrowError(LeaveBalancePolicyError),
  );

  it("rejects a non-boolean N2 usage marker", () => {
    expect(() =>
      calculate({ currentN2WasUsed: "yes" as unknown as boolean }),
    ).toThrowError(LeaveBalancePolicyError);
  });
});
