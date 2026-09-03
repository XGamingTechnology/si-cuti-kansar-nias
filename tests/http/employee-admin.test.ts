import { describe, expect, it, vi } from "vitest";
import { createEmployeeCollectionHandlers } from "@/app/api/admin/employees/route";
import { createEmployeeItemHandlers } from "@/app/api/admin/employees/[employeeId]/route";
import { createEmployeeStatusHandler } from "@/app/api/admin/employees/[employeeId]/status/route";
import type { Principal } from "@/modules/auth/service";

const admin: Principal = {
  userId: "admin",
  employeeId: "admin-employee",
  fullName: "Admin",
  role: "ADMIN_KEPEGAWAIAN",
};
const pegawai: Principal = {
  userId: "pegawai",
  employeeId: "employee-1",
  fullName: "Pegawai",
  role: "PEGAWAI",
};
function deps(principal: Principal | null) {
  const employee = {
    id: "employee-1",
    nip: "TEST-1",
    fullName: "Uji",
    positionTitle: "Analis",
    workUnit: "Unit",
    isActive: true,
    directSupervisorId: null,
  };
  return {
    authentication: { validate: vi.fn(async () => principal) },
    employees: {
      list: vi.fn(async () => [employee]),
      findById: vi.fn(async () => employee),
      create: vi.fn(async () => employee),
      update: vi.fn(async () => employee),
      setActive: vi.fn(async () => employee),
    },
    database: { $disconnect: vi.fn() },
    environment: {},
  };
}
const request = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/admin/employees", {
    method,
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
      "x-role": "ADMIN_KEPEGAWAIAN",
      "x-user-id": "forged",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const valid = {
  id: "forged",
  nip: "TEST-2",
  fullName: "Nama",
  positionTitle: "Jabatan",
  workUnit: "Unit",
  directSupervisorId: null,
  role: "ADMIN_KEPEGAWAIAN",
  userId: "forged",
};
describe("Admin employee HTTP authorization", () => {
  it.each([
    ["unauthenticated", null, 401],
    ["Pegawai", pegawai, 403],
    ["Admin", admin, 200],
  ] as const)("%s list returns %s", async (_n, p, status) =>
    expect(
      (
        await createEmployeeCollectionHandlers(() => deps(p) as never).GET(
          request(),
        )
      ).status,
    ).toBe(status),
  );
  it("denies forged Pegawai create before parsing client claims", async () => {
    const d = deps(pegawai);
    const response = await createEmployeeCollectionHandlers(
      () => d as never,
    ).POST(request("POST", valid));
    expect(response.status).toBe(403);
    expect(d.employees.create).not.toHaveBeenCalled();
  });
  it("allows Admin create but never forwards client-controlled ID or claims", async () => {
    const d = deps(admin);
    const response = await createEmployeeCollectionHandlers(
      () => d as never,
    ).POST(request("POST", valid));
    expect(response.status).toBe(201);
    expect(d.employees.create).toHaveBeenCalledWith({
      nip: "TEST-2",
      fullName: "Nama",
      positionTitle: "Jabatan",
      workUnit: "Unit",
      directSupervisorId: null,
    });
  });
  it("denies Pegawai update and status changes", async () => {
    const d = deps(pegawai);
    const ctx = { params: Promise.resolve({ employeeId: "employee-1" }) };
    expect(
      (
        await createEmployeeItemHandlers(() => d as never).PATCH(
          request("PATCH", valid),
          ctx,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createEmployeeStatusHandler(() => d as never)(
          request("PATCH", { isActive: false }),
          ctx,
        )
      ).status,
    ).toBe(403);
  });
  it("allows Admin update, deactivate, and reactivate", async () => {
    const d = deps(admin);
    const ctx = { params: Promise.resolve({ employeeId: "employee-1" }) };
    expect(
      (
        await createEmployeeItemHandlers(() => d as never).PATCH(
          request("PATCH", valid),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createEmployeeStatusHandler(() => d as never)(
          request("PATCH", { isActive: false }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createEmployeeStatusHandler(() => d as never)(
          request("PATCH", { isActive: true }),
          ctx,
        )
      ).status,
    ).toBe(200);
  });
});
