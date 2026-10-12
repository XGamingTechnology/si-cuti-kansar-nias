import { describe, expect, it, vi } from "vitest";
import { createBalanceBatchHandler } from "@/app/api/admin/annual-balances/batch/handlers";
import {
  AnnualBalanceBatchImportService,
  BALANCE_IMPORT_HEADERS,
} from "@/application/leave-balance/batch-import";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import { balanceTemplateWorkbook } from "@/infrastructure/leave-balance/xlsx-balance-template";
import type { Principal } from "@/modules/auth/service";
import {
  actorUserId,
  batchId,
  BatchTestRepository,
  employeeA,
  row,
} from "../support/annual-balance-batch";

// HTTP boundary tests inject the real application service with an in-memory adapter;
// the production runtime is exercised separately by PostgreSQL integration tests.
vi.mock("@/infrastructure/leave-balance/runtime", () => ({
  createAnnualBalanceAdministrationRuntime: vi.fn(),
}));

const admin: Principal = {
  userId: actorUserId,
  employeeId: employeeA.id,
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN",
};
const pegawai: Principal = { ...admin, role: "PEGAWAI" };
const bytes = balanceTemplateWorkbook([BALANCE_IMPORT_HEADERS, row()]);
function deps(principal: Principal | null) {
  const repository = new BatchTestRepository();
  const balanceImport = new AnnualBalanceBatchImportService(
    new XlsxWorkbookReader(true),
    repository,
  );
  return {
    repository,
    authentication: { validate: vi.fn(async () => principal) },
    balanceImport,
    database: { $disconnect: vi.fn() },
    annualBalances: {},
    environment: {},
  };
}
function request(
  action: "template" | "preview" | "commit",
  body?: FormData,
  year = "2026",
) {
  return new Request(
    `http://localhost/api/admin/annual-balances/batch/${action}?year=${year}`,
    {
      method: action === "template" ? "GET" : "POST",
      headers: { cookie: "si_cuti_session=token" },
      body,
    },
  );
}
function upload(data = bytes, name = "saldo.xlsx") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(data)], name));
  return form;
}

describe("Batch opening balance HTTP boundary", () => {
  it.each(["template", "preview", "commit"] as const)(
    "denies anonymous and employee access to %s before parsing/reading",
    async (action) => {
      for (const [principal, expected] of [
        [null, 401],
        [pegawai, 403],
      ] as const) {
        const d = deps(principal);
        const read = vi.spyOn(d.balanceImport, "preview");
        const template = vi.spyOn(d.balanceImport, "template");
        const write = vi.spyOn(d.balanceImport, "commit");
        const response = await createBalanceBatchHandler(
          action,
          () => d as never,
        )(request(action));
        expect(response.status).toBe(expected);
        expect(read).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(template).not.toHaveBeenCalled();
        expect(d.database.$disconnect).toHaveBeenCalledOnce();
      }
    },
  );
  it("returns a prefilled XLSX attachment for Admin and keeps identity cells as text", async () => {
    const d = deps(admin);
    const response = await createBalanceBatchHandler(
      "template",
      () => d as never,
    )(request("template"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "template-saldo-2026.xlsx",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      (
        await new XlsxWorkbookReader().read(
          new Uint8Array(await response.arrayBuffer()),
        )
      )[1],
    ).toEqual([
      employeeA.nip,
      employeeA.fullName,
      "2026",
      "12",
      "",
      "",
      "0",
      "",
    ]);
    expect(d.repository.accounts).toHaveLength(0);
  });
  it("previews without writes, then derives actor from Admin and commits with stable keys", async () => {
    const d = deps(admin);
    const response = await createBalanceBatchHandler(
      "preview",
      () => d as never,
    )(request("preview", upload()));
    expect(response.status).toBe(200);
    const { preview } = await response.json();
    expect(preview.validRows).toBe(1);
    expect(d.repository.accounts).toHaveLength(0);
    const form = upload();
    form.set("batchId", batchId);
    form.set("previewDigest", preview.digest);
    form.set("confirmedRows", "[2]");
    form.set("actorUserId", "forged");
    const committed = await createBalanceBatchHandler(
      "commit",
      () => d as never,
    )(request("commit", form));
    expect(committed.status).toBe(200);
    expect((await committed.json()).result.succeededRows).toBe(1);
    expect(
      d.repository.operations.every((operation) =>
        operation.idempotencyKey.includes(actorUserId),
      ),
    ).toBe(true);
    expect(
      d.repository.operations.every(
        (operation) => !operation.idempotencyKey.includes("forged"),
      ),
    ).toBe(true);
  });
  it("rejects malformed year and upload transport without writes", async () => {
    const d = deps(admin);
    const handler = createBalanceBatchHandler("preview", () => d as never);
    for (const input of [
      request("preview", upload(), "oops"),
      request("preview"),
      request("preview", upload(bytes, "file.csv")),
      request("preview", upload(new Uint8Array())),
      request("preview", upload(new Uint8Array(2 * 1024 * 1024 + 1))),
      request("preview", upload(new Uint8Array([1, 2]))),
    ]) {
      expect((await handler(input)).status).toBe(422);
    }
    expect(d.repository.accounts).toHaveLength(0);
  });
  it("rejects missing/malformed confirmation, forged digest, changed file, and client row data", async () => {
    const d = deps(admin);
    const preview = await d.balanceImport.preview(bytes, 2026);
    const handler = createBalanceBatchHandler("commit", () => d as never);
    for (const confirmation of [null, "{bad", "[]", "[2,2]", "[9000]"]) {
      const form = upload();
      form.set("batchId", batchId);
      form.set("previewDigest", preview.digest);
      if (confirmation !== null) form.set("confirmedRows", confirmation);
      expect((await handler(request("commit", form))).status).toBe(422);
    }
    const altered = upload(
      balanceTemplateWorkbook([
        BALANCE_IMPORT_HEADERS,
        row(employeeA.nip, { 4: 6 }),
      ]),
    );
    altered.set("batchId", batchId);
    altered.set("previewDigest", preview.digest);
    altered.set("confirmedRows", "[2]");
    expect((await handler(request("commit", altered))).status).toBe(422);
    expect(d.repository.accounts).toHaveLength(0);
  });
  it("maps unexpected failures safely and disconnects", async () => {
    const d = deps(admin);
    vi.spyOn(d.balanceImport, "preview").mockRejectedValue(
      new Error("private database URL"),
    );
    const response = await createBalanceBatchHandler(
      "preview",
      () => d as never,
    )(request("preview", upload()));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database");
    expect(d.database.$disconnect).toHaveBeenCalledOnce();
  });
});
