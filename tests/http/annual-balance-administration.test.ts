import { describe, expect, it, vi } from "vitest";
import { createAnnualBalanceCollectionHandler } from "@/app/api/admin/annual-balances/route";
import { createOpeningBalanceHandler } from "@/app/api/admin/annual-balances/[employeeId]/initialize/route";
import { AnnualBalanceAdministrationError } from "@/application/leave-balance/administration";
import type { Principal } from "@/modules/auth/service";

const employeeId = "00000000-0000-4000-8000-000000000057";
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
  return {
    authentication: { validate: vi.fn(async () => principal) },
    annualBalances: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      initialize: vi.fn(async () => ({ isInitialized: true })),
    },
    database: { $disconnect: vi.fn() },
    environment: {},
  };
}
const request = (url: string, method = "GET", body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("Admin annual balance HTTP delivery", () => {
  it.each([
    [null, 401],
    [pegawai, 403],
    [admin, 200],
  ] as const)("protects list for principal %#", async (principal, status) => {
    const d = deps(principal);
    expect(
      (
        await createAnnualBalanceCollectionHandler(() => d as never)(
          request("http://localhost/api/admin/annual-balances?year=2026"),
        )
      ).status,
    ).toBe(status);
    if (principal !== admin)
      expect(d.annualBalances.list).not.toHaveBeenCalled();
  });

  it("rejects an invalid year safely", async () => {
    const response = await createAnnualBalanceCollectionHandler(
      () => deps(admin) as never,
    )(request("http://localhost/api/admin/annual-balances?year=oops"));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Tahun saldo tidak valid.",
      code: "VALIDATION",
    });
  });

  it("prevents Pegawai from initializing themselves or another employee", async () => {
    for (const id of [employeeId, "00000000-0000-4000-8000-000000000058"]) {
      const d = deps(pegawai);
      const response = await createOpeningBalanceHandler(() => d as never)(
        request(
          `http://localhost/api/admin/annual-balances/${id}/initialize`,
          "POST",
          {
            entitlementYear: 2026,
            n1Days: 0,
            n2Days: 0,
            reason: "Dasar",
            idempotencyKey: "key",
          },
        ),
        { params: Promise.resolve({ employeeId: id }) },
      );
      expect(response.status).toBe(403);
      expect(d.annualBalances.initialize).not.toHaveBeenCalled();
    }
  });

  it("derives actor from the authenticated Admin and ignores client actor", async () => {
    const d = deps(admin);
    const response = await createOpeningBalanceHandler(() => d as never)(
      request(
        `http://localhost/api/admin/annual-balances/${employeeId}/initialize`,
        "POST",
        {
          entitlementYear: 2026,
          n1Days: 2,
          n2Days: 3,
          reason: "Dasar",
          idempotencyKey: "key",
          actorUserId: "forged",
        },
      ),
      { params: Promise.resolve({ employeeId }) },
    );
    expect(response.status).toBe(201);
    expect(d.annualBalances.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId, actorUserId: admin.userId }),
    );
  });

  it.each([
    ["NOT_FOUND", 404],
    ["INACTIVE_EMPLOYEE", 409],
    ["ALREADY_INITIALIZED", 409],
    ["PARTIAL_BALANCE", 409],
    ["CONCURRENT_CONFLICT", 409],
  ] as const)(
    "maps %s without leaking persistence details",
    async (code, status) => {
      const d = deps(admin);
      d.annualBalances.initialize.mockRejectedValueOnce(
        new AnnualBalanceAdministrationError(code, "Pesan administrasi aman."),
      );
      const response = await createOpeningBalanceHandler(() => d as never)(
        request(
          `http://localhost/api/admin/annual-balances/${employeeId}/initialize`,
          "POST",
          {
            entitlementYear: 2026,
            n1Days: 0,
            n2Days: 0,
            reason: "Dasar",
            idempotencyKey: "key",
          },
        ),
        { params: Promise.resolve({ employeeId }) },
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: "Pesan administrasi aman.",
        code,
      });
    },
  );

  it("rejects malformed initialization transport input", async () => {
    const d = deps(admin);
    const response = await createOpeningBalanceHandler(() => d as never)(
      request(
        `http://localhost/api/admin/annual-balances/${employeeId}/initialize`,
        "POST",
        {
          entitlementYear: 2026,
          n1Days: "2",
          n2Days: 0,
          reason: "Dasar",
          idempotencyKey: "key",
        },
      ),
      { params: Promise.resolve({ employeeId }) },
    );
    expect(response.status).toBe(422);
    expect(d.annualBalances.initialize).not.toHaveBeenCalled();
  });
});
