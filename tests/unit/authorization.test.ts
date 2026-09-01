import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  canReadEmployee,
  requireAdmin,
  type ApplicationRole,
} from "@/application/authorization/policy";
import type { Principal } from "@/modules/auth/service";

const admin: Principal = {
  userId: "user-admin",
  employeeId: "employee-admin",
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};
const employee: Principal = {
  userId: "user-employee",
  employeeId: "employee-one",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};

describe("employee authorization policy", () => {
  it("allows an Admin to read their own Employee", () =>
    expect(canReadEmployee(admin, { id: admin.employeeId })).toBe(true));
  it("allows an Admin to read another Employee", () =>
    expect(canReadEmployee(admin, { id: "employee-other" })).toBe(true));
  it("allows a Pegawai to read their own Employee", () =>
    expect(canReadEmployee(employee, { id: employee.employeeId })).toBe(true));
  it("denies a Pegawai reading another Employee", () =>
    expect(canReadEmployee(employee, { id: "employee-other" })).toBe(false));

  it("does not grant access from the same work unit", () => {
    expect(
      canReadEmployee(employee, {
        id: "same-unit-employee",
        workUnit: "Unit Sama",
      } as { id: string }),
    ).toBe(false);
  });

  it("does not grant access from a direct-supervisor relationship", () => {
    expect(
      canReadEmployee(employee, {
        id: "direct-report",
        directSupervisorId: employee.employeeId,
      } as { id: string }),
    ).toBe(false);
  });

  it("defaults unknown role values to denied and never Admin", () => {
    const unknown = { ...employee, role: "ROLE_BARU" as ApplicationRole };
    expect(canReadEmployee(unknown, { id: unknown.employeeId })).toBe(false);
    expect(() => requireAdmin(unknown)).toThrow(AuthorizationError);
  });
});
