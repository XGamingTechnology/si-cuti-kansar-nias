import { describe, it, expect, vi } from "vitest";
import { createEmployeeTemplateHandler } from "@/app/api/admin/employees/template/route";
import { createEmployeeCollectionHandlers } from "@/app/api/admin/employees/route";
import { createEmployeeStatusHandler } from "@/app/api/admin/employees/[employeeId]/status/route";
import { createEmployeeImportHandlers } from "@/app/api/admin/employees/import/route";
import { createAccountHandlers } from "@/app/api/admin/employees/[employeeId]/account/route";
const id = "00000000-0000-4000-8000-000000000001",
  key = "00000000-0000-4000-8000-000000000002";
const principal = {
  userId: id,
  employeeId: id,
  fullName: "Sintetis",
  role: "ADMIN_KEPEGAWAIAN",
};
function deps(role: string | null = "ADMIN_KEPEGAWAIAN") {
  return {
    authentication: {
      validate: vi.fn(async () => (role ? { ...principal, role } : null)),
    },
    database: { $disconnect: vi.fn() },
    employees: { create: vi.fn(), setActive: vi.fn() },
    employeeImport: { preview: vi.fn(), commit: vi.fn(async () => [{ id }]) },
    accounts: { provision: vi.fn() },
  };
}
function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/employees", {
    method: "POST",
    headers: {
      cookie: "si_cuti_session=x",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const valid = {
  nip: "000000123456789012345678",
  fullName: "Sintetis",
  positionTitle: "Uji",
  workUnit: "Unit",
};
const ctx = { params: Promise.resolve({ employeeId: id }) };
describe("Employee administration completeness boundaries", () => {
  it.each([null, "PEGAWAI"])(
    "rejects %s on template and every mutating surface",
    async (role) => {
      const d = deps(role);
      const expected = role ? 403 : 401;
      expect(
        (
          await createEmployeeTemplateHandler(() => d as never)(
            new Request("http://localhost/template", {
              headers: { cookie: "si_cuti_session=x" },
            }),
          )
        ).status,
      ).toBe(expected);
      expect(
        (
          await createEmployeeStatusHandler(() => d as never)(
            req({ isActive: false }),
            ctx,
          )
        ).status,
      ).toBe(expected);
      expect(
        (await createEmployeeImportHandlers(() => d as never).PUT(req({})))
          .status,
      ).toBe(expected);
    },
  );
  it.each(["actorUserId", "userId", "employeeId", "id", "role", "createdAt"])(
    "rejects authority field %s",
    async (field) => {
      const d = deps();
      expect(
        (
          await createEmployeeCollectionHandlers(() => d as never).POST(
            req({ ...valid, [field]: id }),
          )
        ).status,
      ).toBe(422);
      expect(d.employees.create).not.toHaveBeenCalled();
    },
  );
  it("rejects status authority and missing version before mutation", async () => {
    const d = deps();
    const handler = createEmployeeStatusHandler(() => d as never);
    expect(
      (await handler(req({ isActive: false, actorUserId: id }), ctx)).status,
    ).toBe(422);
    expect((await handler(req({ isActive: false }), ctx)).status).toBe(422);
    expect(d.employees.setActive).not.toHaveBeenCalled();
  });
  it("rejects account authority rather than ignoring it", async () => {
    const d = deps();
    expect(
      (
        await createAccountHandlers(() => d as never).POST(
          req({ role: "PEGAWAI", password: "synthetic", actorUserId: id }),
          ctx,
        )
      ).status,
    ).toBe(422);
    expect(d.accounts.provision).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutations", async () => {
    const d = deps();
    expect(
      (
        await createEmployeeCollectionHandlers(() => d as never).POST(
          req(valid, { origin: "https://evil.invalid" }),
        )
      ).status,
    ).toBe(422);
    expect(d.employees.create).not.toHaveBeenCalled();
  });
  it("serves a private empty template with exactly existing headers", async () => {
    const d = deps();
    const response = await createEmployeeTemplateHandler(() => d as never)(
      new Request("http://localhost/template", {
        headers: { cookie: "si_cuti_session=x" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).toString()).toContain(
      "Worksheet Petunjuk bukan data impor",
    );
    const { XlsxWorkbookReader } =
      await import("@/infrastructure/employees/xlsx-workbook-reader");
    expect(await new XlsxWorkbookReader(true, true).read(bytes)).toEqual([
      ["NIP", "Nama Lengkap", "Jabatan", "Unit Kerja", "Status Aktif"],
    ]);
  });
  it("requires an import retry key and passes server hash/actor, never multipart authority", async () => {
    const d = deps(),
      handler = createEmployeeImportHandlers(() => d as never);
    function fileRequest(extra = false, withKey = true) {
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array([80, 75, 3, 4])], "pegawai.xlsx"),
      );
      if (extra) form.set("actorUserId", id);
      return new Request("http://localhost/import", {
        method: "PUT",
        headers: {
          cookie: "si_cuti_session=x",
          ...(withKey ? { "idempotency-key": key } : {}),
        },
        body: form,
      });
    }
    expect((await handler.PUT(fileRequest(false, false))).status).toBe(422);
    expect((await handler.PUT(fileRequest(true))).status).toBe(422);
    expect((await handler.PUT(fileRequest())).status).toBe(201);
    expect(d.employeeImport.commit).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      {
        actorUserId: id,
        idempotencyKey: key,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    );
  });
  it("bounds actual upload bytes even without content-length", async () => {
    const d = deps();
    const request = new Request("http://localhost/import", {
      method: "POST",
      headers: {
        cookie: "si_cuti_session=x",
        "content-type": "multipart/form-data; boundary=bounded",
      },
      body: new Uint8Array(2 * 1024 * 1024 + 1),
    });
    const response = await createEmployeeImportHandlers(() => d as never).POST(
      request,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Ukuran unggahan");
    expect(d.employeeImport.preview).not.toHaveBeenCalled();
  });
});
