import { describe, expect, it, vi } from "vitest";
import { createAccountHandlers } from "@/app/api/admin/employees/[employeeId]/account/route";
import { createAccountPasswordHandler } from "@/app/api/admin/employees/[employeeId]/account/password/route";
import { AccountAdministrationError } from "@/application/accounts/service";
import type { Principal } from "@/modules/auth/service";

const employeeId = "00000000-0000-4000-8000-000000000001";
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
const account = {
  employeeId,
  username: "TEST-001",
  role: "PEGAWAI" as const,
  isActive: true,
};

function deps(principal: Principal | null) {
  return {
    authentication: { validate: vi.fn(async () => principal) },
    accounts: {
      findByEmployeeId: vi.fn(async () => account),
      provision: vi.fn(async () => account),
      update: vi.fn(async () => account),
      resetPassword: vi.fn(async () => account),
    },
    database: { $disconnect: vi.fn() },
    environment: {},
  };
}
const request = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/admin/employees/id/account", {
    method,
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
      "x-role": "ADMIN_KEPEGAWAIAN",
      "x-user-id": "forged",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (id = employeeId) => ({
  params: Promise.resolve({ employeeId: id }),
});

describe("Admin account HTTP authorization", () => {
  it.each([
    ["unauthenticated", null, 401],
    ["Pegawai", pegawai, 403],
    ["Admin", admin, 200],
  ] as const)(
    "%s account lookup returns %s",
    async (_name, principal, status) => {
      expect(
        (
          await createAccountHandlers(() => deps(principal) as never).GET(
            request(),
            context(),
          )
        ).status,
      ).toBe(status);
    },
  );

  it("authorizes before lookup, parsing, or mutation for every operation", async () => {
    for (const principal of [null, pegawai]) {
      const d = deps(principal);
      const handlers = createAccountHandlers(() => d as never);
      expect(
        (
          await handlers.POST(
            request("POST", { role: "PEGAWAI", password: "secret" }),
            context(),
          )
        ).status,
      ).toBe(principal ? 403 : 401);
      expect(
        (await handlers.PATCH(request("PATCH", { isActive: false }), context()))
          .status,
      ).toBe(principal ? 403 : 401);
      expect(
        (
          await createAccountPasswordHandler(() => d as never)(
            request("PATCH", { password: "baru" }),
            context(),
          )
        ).status,
      ).toBe(principal ? 403 : 401);
      expect(d.accounts.provision).not.toHaveBeenCalled();
      expect(d.accounts.update).not.toHaveBeenCalled();
      expect(d.accounts.resetPassword).not.toHaveBeenCalled();
    }
  });

  it("allows Admin provisioning and never forwards forged claims", async () => {
    const d = deps(admin);
    const response = await createAccountHandlers(() => d as never).POST(
      request("POST", {
        employeeId: "forged",
        userId: "forged",
        role: "PEGAWAI",
        password: "secret",
      }),
      context(),
    );
    expect(response.status).toBe(201);
    expect(d.accounts.provision).toHaveBeenCalledWith(
      employeeId,
      expect.objectContaining({ role: "PEGAWAI", password: "secret" }),
    );
    expect(JSON.stringify(await response.json())).not.toMatch(
      /password|credential|identityId/i,
    );
  });

  it("maps duplicate provisioning to a safe 409", async () => {
    const d = deps(admin);
    d.accounts.provision.mockRejectedValueOnce(
      new AccountAdministrationError(
        "CONFLICT",
        "Pegawai sudah memiliki akun.",
      ),
    );
    const response = await createAccountHandlers(() => d as never).POST(
      request("POST", { role: "PEGAWAI", password: "x" }),
      context(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Pegawai sudah memiliki akun.",
    });
  });

  it("rejects malformed employee UUID before account access", async () => {
    const d = deps(admin);
    const response = await createAccountHandlers(() => d as never).GET(
      request(),
      context("not-a-uuid"),
    );
    expect(response.status).toBe(422);
    expect(d.accounts.findByEmployeeId).not.toHaveBeenCalled();
  });

  it("supports Admin role, status, and password operations", async () => {
    const d = deps(admin);
    const handlers = createAccountHandlers(() => d as never);
    expect(
      (
        await handlers.PATCH(
          request("PATCH", { role: "ADMIN_KEPEGAWAIAN" }),
          context(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await handlers.PATCH(request("PATCH", { isActive: false }), context()))
        .status,
    ).toBe(200);
    expect(
      (
        await createAccountPasswordHandler(() => d as never)(
          request("PATCH", { password: "baru" }),
          context(),
        )
      ).status,
    ).toBe(200);
  });

  it("returns 422 for an invalid role", async () => {
    const d = deps(admin);
    d.accounts.update.mockRejectedValueOnce(
      new AccountAdministrationError("VALIDATION", "Role akun tidak valid."),
    );
    const response = await createAccountHandlers(() => d as never).PATCH(
      request("PATCH", { role: "ADMIN" }),
      context(),
    );
    expect(response.status).toBe(422);
  });
});
