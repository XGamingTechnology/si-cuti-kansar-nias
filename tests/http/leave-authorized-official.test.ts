import { describe, expect, it, vi } from "vitest";
import { createLeaveAuthorizedOfficialCollectionHandlers } from "@/app/api/admin/leave-authorized-officials/route";
import { createLeaveAuthorizedOfficialItemHandlers } from "@/app/api/admin/leave-authorized-officials/[id]/route";
import type { Principal } from "@/modules/auth/service";

const id = "00000000-0000-4000-8000-000000000099";
const admin: Principal = {
  userId: "admin",
  employeeId: "employee-admin",
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};
const pegawai: Principal = {
  userId: "pegawai",
  employeeId: "employee-test",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};
function deps(principal: Principal | null) {
  return {
    authentication: { validate: vi.fn(async () => principal) },
    officials: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({ id })),
      create: vi.fn(async (value) => value),
      update: vi.fn(async (_id, value) => value),
    },
    database: { $disconnect: vi.fn() },
  };
}
const payload = {
  fullName: "Pejabat Fiktif",
  nip: "000000000000000001",
  capacity: "DEFINITIVE",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};
function request(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/admin/leave-authorized-officials", {
    method,
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("authorized leave official HTTP authorization", () => {
  it.each([
    [null, 401],
    [pegawai, 403],
    [admin, 200],
  ] as const)("protects list for principal %#", async (principal, status) => {
    const runtime = deps(principal);
    const response = await createLeaveAuthorizedOfficialCollectionHandlers(
      () => runtime as never,
    ).GET(request());
    expect(response.status).toBe(status);
    if (principal !== admin)
      expect(runtime.officials.list).not.toHaveBeenCalled();
  });
  it("allows Admin to create and update", async () => {
    const runtime = deps(admin);
    const collection = createLeaveAuthorizedOfficialCollectionHandlers(
      () => runtime as never,
    );
    expect((await collection.POST(request("POST", payload))).status).toBe(201);
    const item = createLeaveAuthorizedOfficialItemHandlers(
      () => runtime as never,
    );
    expect(
      (
        await item.PUT(request("PUT", { ...payload, capacity: "PLT" }), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(200);
    expect(runtime.officials.create).toHaveBeenCalled();
    expect(runtime.officials.update).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ capacity: "PLT" }),
    );
  });
  it.each([pegawai, null])("prevents non-admin mutation", async (principal) => {
    const runtime = deps(principal);
    const response = await createLeaveAuthorizedOfficialCollectionHandlers(
      () => runtime as never,
    ).POST(request("POST", payload));
    expect(response.status).toBe(principal ? 403 : 401);
    expect(runtime.officials.create).not.toHaveBeenCalled();
  });
});
