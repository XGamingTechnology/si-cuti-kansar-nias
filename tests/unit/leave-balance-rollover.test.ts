import { describe, expect, it } from "vitest";
import {
  calculateProvisionalAnnualRollover,
  LeaveBalancePolicyError,
} from "@/domain/leave-balance";

const calculate = (
  previousYearNRemaining: number,
  previousYearCommittedAnnualLeaveDays = 0,
  twoYearsAgoCommittedAnnualLeaveDays = 0,
) =>
  calculateProvisionalAnnualRollover({
    previousYearNRemaining,
    previousYearCommittedAnnualLeaveDays,
    twoYearsAgoCommittedAnnualLeaveDays,
  });

describe("calculateProvisionalAnnualRollover", () => {
  it.each([
    [4, 4],
    [9, 6],
    [0, 0],
  ])("maps previous N remaining %s to N1 %s", (remaining, expectedN1) => {
    expect(calculate(remaining).n1).toBe(expectedN1);
  });

  it.each([
    [0, 0, 6],
    [0, 1, 0],
    [1, 0, 0],
  ])(
    "maps committed usage %s and %s to N2 %s",
    (previousUsage, olderUsage, expectedN2) => {
      expect(calculate(0, previousUsage, olderUsage).n2).toBe(expectedN2);
    },
  );

  it("grants the full 12-day N baseline without mid-year prorating input", () => {
    expect(calculate(0)).toMatchObject({ n: 12 });
  });

  it.each([
    [-1, 0, 0],
    [1.5, 0, 0],
    [0, -1, 0],
    [0, 0.5, 0],
    [0, 0, -1],
    [0, 0, 1.5],
  ])(
    "rejects invalid whole-day inputs (%s, %s, %s)",
    (remaining, previousUsage, olderUsage) => {
      expect(() =>
        calculate(remaining, previousUsage, olderUsage),
      ).toThrowError(LeaveBalancePolicyError);
    },
  );
});
