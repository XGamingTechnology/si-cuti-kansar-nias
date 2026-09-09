import { describe, expect, it, vi } from "vitest";
import {
  createActionHandler,
  createCollectionHandlers,
  createDetailHandlers,
  createPermissionTypesHandler,
  type WorkflowRuntime,
} from "@/application/workflow/delivery";
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
