import { describe, expect, it, vi } from "vitest";
import { createEmployeeCollectionHandlers } from "@/app/api/admin/employees/route";
import { createEmployeeItemHandlers } from "@/app/api/admin/employees/[employeeId]/route";
import { createEmployeeStatusHandler } from "@/app/api/admin/employees/[employeeId]/status/route";
import type { Principal } from "@/modules/auth/service";

const employeeId = "00000000-0000-4000-8000-000000000001";
const unknownSupervisorId = "00000000-0000-4000-8000-000000000099";

const admin: Principal = {
  userId: "admin",
  employeeId: "admin-employee",
  fullName: "Admin",
  role: "ADMIN_KEPEGAWAIAN",
};
const pegawai: Principal = {
  userId: "pegawai",
  employeeId,
  fullName: "Pegawai",
  role: "PEGAWAI",
};
function deps(principal: Principal | null) {
  const employee = {
    id: employeeId,
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
    const ctx = { params: Promise.resolve({ employeeId }) };
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
    const ctx = { params: Promise.resolve({ employeeId }) };
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

  it.each([
    [
      "GET",
      (d: ReturnType<typeof deps>) =>
        createEmployeeItemHandlers(() => d as never).GET(request(), {
          params: Promise.resolve({ employeeId: "bukan-uuid" }),
        }),
    ],
    [
      "PATCH",
      (d: ReturnType<typeof deps>) =>
        createEmployeeItemHandlers(() => d as never).PATCH(
          request("PATCH", valid),
          { params: Promise.resolve({ employeeId: "bukan-uuid" }) },
        ),
    ],
    [
      "status PATCH",
      (d: ReturnType<typeof deps>) =>
        createEmployeeStatusHandler(() => d as never)(
          request("PATCH", { isActive: false }),
          { params: Promise.resolve({ employeeId: "bukan-uuid" }) },
        ),
    ],
  ] as const)(
    "rejects a malformed employeeId for %s before data access",
    async (_name, invoke) => {
      const d = deps(admin);
      const response = await invoke(d);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "ID pegawai tidak valid.",
      });
      expect(d.employees.findById).not.toHaveBeenCalled();
      expect(d.employees.update).not.toHaveBeenCalled();
      expect(d.employees.setActive).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "create",
      (d: ReturnType<typeof deps>) =>
        createEmployeeCollectionHandlers(() => d as never).POST(
          request("POST", { ...valid, directSupervisorId: "bukan-uuid" }),
        ),
    ],
    [
      "update",
      (d: ReturnType<typeof deps>) =>
        createEmployeeItemHandlers(() => d as never).PATCH(
          request("PATCH", { ...valid, directSupervisorId: "bukan-uuid" }),
          { params: Promise.resolve({ employeeId }) },
        ),
    ],
  ] as const)(
    "rejects a malformed directSupervisorId on %s",
    async (_name, invoke) => {
      const d = deps(admin);
      const response = await invoke(d);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Atasan langsung tidak valid.",
      });
      expect(d.employees.create).not.toHaveBeenCalled();
      expect(d.employees.update).not.toHaveBeenCalled();
    },
  );

  it("accepts a well-formed supervisor UUID for application-level existence validation", async () => {
    const d = deps(admin);
    await createEmployeeCollectionHandlers(() => d as never).POST(
      request("POST", { ...valid, directSupervisorId: unknownSupervisorId }),
    );
    expect(d.employees.create).toHaveBeenCalledWith(
      expect.objectContaining({ directSupervisorId: unknownSupervisorId }),
    );
  });
});
