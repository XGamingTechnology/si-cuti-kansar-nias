import { describe, expect, it } from "vitest";
import {
  defineJointLeavePolicy,
  LeaveBalancePolicyError,
} from "@/domain/leave-balance";

describe("defineJointLeavePolicy", () => {
  it("preserves configurable quota, window, and cross-year credit year", () => {
    const policy = defineJointLeavePolicy({
      applicableYear: 2025,
      eventDates: ["2025-12-24"],
      quotaDays: 3,
      claimOpensAt: new Date("2026-01-02T00:00:00Z"),
      claimDeadlineAt: new Date("2026-02-15T23:59:59Z"),
      creditYear: 2026,
    });
    expect(policy).toMatchObject({
      applicableYear: 2025,
      quotaDays: 3,
      creditYear: 2026,
    });
  });

  it("accepts another Admin-configured quota and deadline rather than a global constant", () => {
    expect(
      defineJointLeavePolicy({
        applicableYear: 2026,
        eventDates: ["2026-05-15"],
        quotaDays: 7,
        claimOpensAt: new Date("2026-06-01Z"),
        claimDeadlineAt: new Date("2026-12-31Z"),
        creditYear: 2026,
      }),
    ).toMatchObject({ quotaDays: 7 });
  });

  it("rejects an invalid claim window", () => {
    expect(() =>
      defineJointLeavePolicy({
        applicableYear: 2026,
        eventDates: ["2026-05-15"],
        quotaDays: 1,
        claimOpensAt: new Date("2026-02-01Z"),
        claimDeadlineAt: new Date("2026-01-01Z"),
        creditYear: 2026,
      }),
    ).toThrowError(LeaveBalancePolicyError);
  });
});
