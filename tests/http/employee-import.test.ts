import { describe, expect, it, vi } from "vitest";
import { createEmployeeImportHandlers } from "@/app/api/admin/employees/import/route";
import type { Principal } from "@/modules/auth/service";

const admin: Principal = {
  userId: "a",
  employeeId: "e",
  fullName: "Admin",
  role: "ADMIN_KEPEGAWAIAN",
};
const pegawai: Principal = { ...admin, role: "PEGAWAI" };
function deps(principal: Principal | null) {
  return {
    authentication: { validate: vi.fn(async () => principal) },
    employeeImport: {
      preview: vi.fn(async () => ({
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        rows: [],
        errors: [],
      })),
      commit: vi.fn(),
    },
    database: { $disconnect: vi.fn() },
  };
}
function request(
  bytes = new Uint8Array([0x50, 0x4b, 3, 4]),
  name = "pegawai.xlsx",
) {
  const data = new FormData();
  data.append(
    "file",
    new File([bytes], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return new Request("http://localhost/api/admin/employees/import", {
    method: "POST",
    headers: { cookie: "si_cuti_session=token" },
    body: data,
  });
}
describe("Employee import HTTP", () => {
  it.each([
    ["unauthenticated", null, 401],
    ["Pegawai", pegawai, 403],
    ["Admin", admin, 200],
  ] as const)("%s authorization -> %s", async (_name, principal, status) =>
    expect(
      (
        await createEmployeeImportHandlers(() => deps(principal) as never).POST(
          request(),
        )
      ).status,
    ).toBe(status),
  );
  it("safely rejects non-Excel files before parsing", async () => {
    const d = deps(admin);
    const response = await createEmployeeImportHandlers(() => d as never).POST(
      request(new Uint8Array([1]), "pegawai.txt"),
    );
    expect(response.status).toBe(422);
    expect(d.employeeImport.preview).not.toHaveBeenCalled();
  });
});
