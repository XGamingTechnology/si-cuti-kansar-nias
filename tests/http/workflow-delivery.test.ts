import { describe, expect, it, vi } from "vitest";
import {
  createActionHandler,
  createCollectionHandlers,
  createDetailHandlers,
  createPermissionTypesHandler,
  type WorkflowRuntime,
} from "@/application/workflow/delivery";
import { BalanceMutationError } from "@/application/leave-balance/service";
import { LeaveBalancePolicyError } from "@/domain/leave-balance/errors";
import { WorkflowError } from "@/application/workflow/types";
import type { Principal } from "@/modules/auth/service";

const pegawai: Principal = {
  userId: "user-1",
  employeeId: "employee-1",
  fullName: "Pegawai Uji",
  role: "PEGAWAI",
};
const admin: Principal = {
  ...pegawai,
  userId: "admin-1",
  employeeId: "employee-admin",
  role: "ADMIN_KEPEGAWAIAN",
};

function runtime(
  principal: Principal | null,
  overrides: Record<string, unknown> = {},
) {
  const leave = {
    list: vi.fn().mockResolvedValue([]),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    get: vi.fn(),
    revisions: vi.fn(),
    history: vi.fn(),
    submit: vi.fn().mockResolvedValue({ id: "transition" }),
    cancel: vi.fn().mockResolvedValue({}),
    returnForCorrection: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
    approve: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  const permission = {
    ...leave,
    createDraft: vi.fn(),
    activeTypes: vi
      .fn()
      .mockResolvedValue([
        { id: "type-1", code: "DINAS", name: "Izin Dinas", description: null },
      ]),
  };
  const value = {
    authentication: { validate: vi.fn().mockResolvedValue(principal) },
    leave,
    permission,
    database: { $disconnect: vi.fn() },
    repository: {},
  };
  return { value: value as unknown as WorkflowRuntime, leave, permission };
}
const request = (method = "GET", body?: object) =>
  new Request("http://localhost/api", {
    method,
    headers: { cookie: "si_cuti_session=opaque" },
    body: body ? JSON.stringify(body) : undefined,
  });
const context = { params: Promise.resolve({ id: "request-1" }) };

describe("workflow HTTP delivery", () => {
  it("menolak akses tanpa sesi", async () => {
    const mock = runtime(null);
    const response = await createCollectionHandlers(
      "leave",
      () => mock.value,
    ).GET(request());
    expect(response.status).toBe(401);
    expect(mock.leave.list).not.toHaveBeenCalled();
  });

  it("meneruskan principal Pegawai ke service untuk isolasi pemilik/IDOR", async () => {
    const get = vi
      .fn()
      .mockRejectedValue(new WorkflowError("FORBIDDEN", "Forbidden"));
    const mock = runtime(pegawai, { get });
    const response = await createDetailHandlers("leave", () => mock.value).GET(
      request(),
      context,
    );
    expect(response.status).toBe(403);
    expect(get).toHaveBeenCalledWith(pegawai, "request-1");
  });

  it("memberi Admin akses baca melalui boundary service", async () => {
    const get = vi.fn().mockResolvedValue({ id: "request-1" });
    const mock = runtime(admin, { get });
    const response = await createDetailHandlers("leave", () => mock.value).GET(
      request(),
      context,
    );
    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith(admin, "request-1");
  });

  it("melarang Admin mengubah konten melalui service", async () => {
    const updateDraft = vi
      .fn()
      .mockRejectedValue(new WorkflowError("FORBIDDEN", "Forbidden"));
    const mock = runtime(admin, { updateDraft });
    const response = await createDetailHandlers(
      "leave",
      () => mock.value,
    ).PATCH(
      request("PATCH", {
        leaveType: "ANNUAL",
        startDate: "2026-09-10",
        endDate: "2026-09-11",
        reason: "Keperluan keluarga",
      }),
      context,
    );
    expect(response.status).toBe(403);
  });

  it.each(["SUBMIT", "CANCEL", "RETURN", "REJECT", "APPROVE"])(
    "mengirim tindakan %s dan key server baru",
    async (action) => {
      const mock = runtime(
        action === "SUBMIT" || action === "CANCEL" ? pegawai : admin,
      );
      const handler = createActionHandler("leave", () => mock.value);
      const payload = {
        action,
        reason: "Alasan keputusan",
        evidenceReference: "ARSIP-FISIK-01",
      };
      expect((await handler(request("POST", payload), context)).status).toBe(
        200,
      );
      expect((await handler(request("POST", payload), context)).status).toBe(
        200,
      );
      const method =
        action === "SUBMIT"
          ? "submit"
          : action === "CANCEL"
            ? "cancel"
            : action === "RETURN"
              ? "returnForCorrection"
              : action === "REJECT"
                ? "reject"
                : "approve";
      const calls = mock.leave[method as keyof typeof mock.leave] as ReturnType<
        typeof vi.fn
      >;
      const firstKey = calls.mock.calls[0].at(-1);
      const secondKey = calls.mock.calls[1].at(-1);
      expect(firstKey).not.toBe(secondKey);
    },
  );

  it.each([
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["ILLEGAL_TRANSITION", 409],
    ["CONFLICT", 409],
    ["UNSUPPORTED_POLICY", 422],
  ] as const)("memetakan %s tanpa detail internal", async (code, status) => {
    const mock = runtime(pegawai, {
      list: vi.fn().mockRejectedValue(new WorkflowError(code, "Pesan aman")),
    });
    const response = await createCollectionHandlers(
      "leave",
      () => mock.value,
    ).GET(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Pesan aman", code });
  });

  it.each([
    ["VALIDATION", 400, "Data saldo cuti tahunan tidak valid."],
    ["NOT_FOUND", 404, "Saldo cuti tahunan tidak ditemukan."],
    [
      "CONFLICT",
      409,
      "Kondisi saldo cuti tahunan bertentangan dengan tindakan ini atau telah berubah.",
    ],
  ] as const)(
    "memetakan BalanceMutationError %s ke respons aman",
    async (code, status, message) => {
      const mock = runtime(pegawai, {
        submit: vi
          .fn()
          .mockRejectedValue(
            new BalanceMutationError(code, "SQL SELECT bucket N2 rahasia"),
          ),
      });
      const response = await createActionHandler("leave", () => mock.value)(
        request("POST", { action: "SUBMIT" }),
        context,
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: message,
        code: `BALANCE_MUTATION_${code}`,
      });
    },
  );

  it("memetakan invariant saldo yang belum siap tanpa membocorkan detail internal", async () => {
    const internal =
      "Akun saldo N2 pada AnnualBalanceAccount id=db-123 belum tersedia; SELECT * FROM account";
    const mock = runtime(pegawai, {
      submit: vi
        .fn()
        .mockRejectedValue(new BalanceMutationError("INVARIANT", internal)),
    });
    const response = await createActionHandler("leave", () => mock.value)(
      request("POST", { action: "SUBMIT" }),
      context,
    );
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toEqual({
      error:
        "Saldo cuti tahunan belum siap untuk pengajuan ini. Hubungi Admin Kepegawaian.",
      code: "BALANCE_MUTATION_INVARIANT",
    });
    expect(JSON.stringify(body)).not.toContain(internal);
    expect(JSON.stringify(body)).not.toMatch(
      /N2|AnnualBalanceAccount|SELECT|db-123/,
    );
  });

  it.each([
    [
      "INSUFFICIENT_BALANCE",
      422,
      "Saldo cuti tahunan tidak mencukupi untuk pengajuan ini.",
    ],
    ["VALIDATION", 400, "Data saldo cuti tahunan tidak valid."],
    [
      "DUPLICATE_CALENDAR_DATE",
      409,
      "Konfigurasi kalender cuti tahunan memiliki tanggal yang sama.",
    ],
    ["EXCESSIVE_RESTORATION", 422, "Pemulihan saldo cuti tahunan tidak valid."],
  ] as const)(
    "memetakan LeaveBalancePolicyError %s ke respons aman",
    async (code, status, message) => {
      const mock = runtime(pegawai, {
        submit: vi
          .fn()
          .mockRejectedValue(
            new LeaveBalancePolicyError(
              code,
              "Raw bucket N detail with SQL and stack trace",
            ),
          ),
      });
      const response = await createActionHandler("leave", () => mock.value)(
        request("POST", { action: "SUBMIT" }),
        context,
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: message,
        code: `LEAVE_BALANCE_POLICY_${code}`,
      });
    },
  );

  it("mempertahankan fallback 500 generik untuk error tak terduga", async () => {
    const mock = runtime(pegawai, {
      submit: vi
        .fn()
        .mockRejectedValue(
          new Error("SELECT secret FROM AnnualBalanceAccount"),
        ),
    });
    const response = await createActionHandler("leave", () => mock.value)(
      request("POST", { action: "SUBMIT" }),
      context,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Operasi alur kerja gagal.",
    });
  });

  it("menyajikan hanya jenis izin aktif dari read path service", async () => {
    const mock = runtime(pegawai);
    const response = await createPermissionTypesHandler(() => mock.value)(
      request(),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).permissionTypes[0].name).toBe("Izin Dinas");
  });

  it("mengirim create izin hanya ke PermissionWorkflowService", async () => {
    const mock = runtime(pegawai);
    mock.permission.createDraft.mockResolvedValue({ id: "permission-1" });
    const response = await createCollectionHandlers(
      "permission",
      () => mock.value,
    ).POST(
      request("POST", {
        permissionTypeId: "type-1",
        startDate: "2026-09-10",
        endDate: "2026-09-10",
        reason: "Keperluan kedinasan",
      }),
    );
    expect(response.status).toBe(201);
    expect(mock.permission.createDraft).toHaveBeenCalled();
    expect(mock.leave.createDraft).not.toHaveBeenCalled();
  });
});
