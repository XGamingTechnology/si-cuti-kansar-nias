import { describe, expect, it, vi } from "vitest";
import { createAdminAccessHandler } from "@/app/api/admin/access/route";
import { createEmployeeReadHandler } from "@/app/api/employees/[employeeId]/route";
import type { Principal } from "@/modules/auth/service";

const ownEmployeeId = "00000000-0000-4000-8000-000000000001";
const otherEmployeeId = "00000000-0000-4000-8000-000000000002";

const admin: Principal = {
  userId: "admin-user",
  employeeId: "admin-employee",
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};
const employee: Principal = {
  userId: "employee-user",
  employeeId: ownEmployeeId,
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};

function dependencies(principal: Principal | null) {
  return {
    authentication: { validate: vi.fn(async () => principal) },
    employees: {
      findById: vi.fn(async (id: string) => ({
        id,
        nip: "TEST-001",
        fullName: "Pegawai Uji",
        positionTitle: "Jabatan Uji",
        workUnit: "Unit Uji",
        isActive: true,
      })),
    },
    database: { $disconnect: vi.fn(async () => undefined) },
    environment: {} as never,
  };
}

const request = (body?: unknown) =>
  new Request("http://localhost/api/protected", {
    headers: {
      cookie: "si_cuti_session=server-session",
      ...(body
        ? { "content-type": "application/json", "x-role": "ADMIN_KEPEGAWAIAN" }
        : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });

describe("protected server routes", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const response = await createAdminAccessHandler(
      () => dependencies(null) as never,
    )(request());
    expect(response.status).toBe(401);
  });

  it("rejects Pegawai from the Admin-only resource with 403", async () => {
    const response = await createAdminAccessHandler(
      () => dependencies(employee) as never,
    )(request());
    expect(response.status).toBe(403);
  });

  it("allows Admin Kepegawaian to access the Admin-only resource", async () => {
    const response = await createAdminAccessHandler(
      () => dependencies(admin) as never,
    )(request());
    expect(response.status).toBe(200);
  });

  it("allows Pegawai to request their own Employee", async () => {
    const deps = dependencies(employee);
    const response = await createEmployeeReadHandler(() => deps as never)(
      request(),
      { params: Promise.resolve({ employeeId: employee.employeeId }) },
    );
    expect(response.status).toBe(200);
    expect(deps.employees.findById).toHaveBeenCalledWith(employee.employeeId);
  });

  it("denies another Employee without reading or disclosing the resource", async () => {
    const deps = dependencies(employee);
    const response = await createEmployeeReadHandler(() => deps as never)(
      request(),
      { params: Promise.resolve({ employeeId: otherEmployeeId }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Akses ditolak." });
    expect(deps.employees.findById).not.toHaveBeenCalled();
  });

  it("uses only the validated session principal, ignoring client authorization claims", async () => {
    const deps = dependencies(employee);
    const forged = request({
      role: "ADMIN_KEPEGAWAIAN",
      employeeId: otherEmployeeId,
      userId: "admin-user",
    });
    const response = await createEmployeeReadHandler(() => deps as never)(
      forged,
      { params: Promise.resolve({ employeeId: otherEmployeeId }) },
    );
    expect(response.status).toBe(403);
    expect(deps.authentication.validate).toHaveBeenCalledWith("server-session");
  });
});
