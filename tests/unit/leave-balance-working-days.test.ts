import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  LeaveBalancePolicyError,
} from "@/domain/leave-balance";

describe("countWorkingDays", () => {
  it("counts a Monday-Friday range", () => {
    expect(
      countWorkingDays({ startDate: "2026-09-07", endDate: "2026-09-11" }),
    ).toBe(5);
  });

  it("counts Friday through Monday as two working days", () => {
    expect(
      countWorkingDays({ startDate: "2026-09-04", endDate: "2026-09-07" }),
    ).toBe(2);
  });

  it.each([
    "PUBLIC_HOLIDAY",
    "JOINT_LEAVE",
    "INSTITUTION_NON_WORKING",
  ] as const)("excludes a weekday %s", (type) => {
    expect(
      countWorkingDays({
        startDate: "2026-09-07",
        endDate: "2026-09-11",
        calendarOverrides: [{ date: "2026-09-09", type }],
      }),
    ).toBe(4);
  });

  it("counts a weekend WORKING_DAY_OVERRIDE", () => {
    expect(
      countWorkingDays({
        startDate: "2026-09-05",
        endDate: "2026-09-06",
        calendarOverrides: [
          { date: "2026-09-05", type: "WORKING_DAY_OVERRIDE" },
        ],
      }),
    ).toBe(1);
  });

  it("counts one working day", () => {
    expect(
      countWorkingDays({ startDate: "2026-09-07", endDate: "2026-09-07" }),
    ).toBe(1);
  });

  it("does not count one weekend day", () => {
    expect(
      countWorkingDays({ startDate: "2026-09-06", endDate: "2026-09-06" }),
    ).toBe(0);
  });

  it("includes both endpoints", () => {
    expect(
      countWorkingDays({ startDate: "2026-09-07", endDate: "2026-09-08" }),
    ).toBe(2);
  });

  it("rejects a reversed date range", () => {
    expect(() =>
      countWorkingDays({ startDate: "2026-09-08", endDate: "2026-09-07" }),
    ).toThrowError(
      expect.objectContaining<Partial<LeaveBalancePolicyError>>({
        code: "VALIDATION",
      }),
    );
  });

  it.each(["07-09-2026", "2026-02-30", "2026-9-07"])(
    "rejects malformed business date %s",
    (startDate) => {
      expect(() =>
        countWorkingDays({ startDate, endDate: "2026-09-08" }),
      ).toThrowError(LeaveBalancePolicyError);
    },
  );

  it("rejects duplicate calendar dates rather than resolving ambiguity", () => {
    expect(() =>
      countWorkingDays({
        startDate: "2026-09-07",
        endDate: "2026-09-07",
        calendarOverrides: [
          { date: "2026-09-07", type: "PUBLIC_HOLIDAY" },
          { date: "2026-09-07", type: "WORKING_DAY_OVERRIDE" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LeaveBalancePolicyError>>({
        code: "DUPLICATE_CALENDAR_DATE",
      }),
    );
  });
});
