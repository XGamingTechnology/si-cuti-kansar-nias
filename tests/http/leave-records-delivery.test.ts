import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createDecisionDocumentHandler,
  createDecisionEditionHandlers,
  createDecisionEditionPreviewHandler,
  createDecisionHandler,
  createReturnHandlers,
  createReturnPreviewHandler,
  createReturnEvidenceHandler,
} from "@/application/leave-records/delivery";
import { WorkflowError } from "@/application/workflow/types";
import type { LeaveDocumentRuntime } from "@/infrastructure/leave-documents/runtime";
import type { Principal } from "@/modules/auth/service";

const id = randomUUID(),
  context = { params: Promise.resolve({ id }) };
const admin: Principal = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Admin",
  role: "ADMIN_KEPEGAWAIAN",
};
const owner: Principal = { ...admin, role: "PEGAWAI" };
function fixture(principal: Principal | null = admin) {
  const value = {
    authentication: { validate: vi.fn(async () => principal) },
    leave: {
      get: vi.fn(async () => ({
        id,
        status: "APPROVED",
        employeeId: owner.employeeId,
        currentRevision: { id: randomUUID(), leaveType: "ANNUAL" },
      })),
    },
    records: {
      previewDecisionEdition: vi.fn(async () => ({
        content: new Uint8Array([37, 80, 68, 70]),
        fingerprint: "preview-bound",
      })),
      saveDecisionEdition: vi.fn(async () => ({ id: "edition", version: 1 })),
      decision: vi.fn(async () => ({
        id: "archive",
        snapshot: { status: "APPROVED" },
      })),
      decisionDocument: vi.fn(async () => ({
        id: "archive",
        status: "APPROVED",
        content: new Uint8Array([37, 80, 68, 70]),
      })),
      returns: vi.fn(async () => []),
      preview: vi.fn(async () => ({ fingerprint: "test" })),
      apply: vi.fn(
        async (
          _actor: Principal,
          _id: string,
          _input: unknown,
          _key: string,
          _fingerprint: string,
          _sourceIp: string | null,
        ) => ({
          id: "return",
          caller: _actor.userId,
          request: _id,
          input: _input,
          key: _key,
          fingerprint: _fingerprint,
          sourceIp: _sourceIp,
        }),
      ),
    },
    documents: { uploadReturnEvidence: vi.fn() },
    database: { $disconnect: vi.fn(async () => undefined) },
  };
  return { value, factory: () => value as unknown as LeaveDocumentRuntime };
}
const request = (method = "GET", body?: unknown) =>
  new Request("http://localhost/api/workflow/leave/" + id + "/returns", {
    method,
    headers: {
      cookie: "si_cuti_session=test",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const input = {
  restoredDays: 5,
  reason: "Penugasan resmi",
  basisReference: "BASIS",
  basisDate: "2099-01-13",
  evidenceDocumentId: randomUUID(),
  unusedDaysConfirmed: true,
  idempotencyKey: randomUUID(),
  fingerprint: "test",
};
describe("leave records HTTP authorization and replay boundary", () => {
  it.each([
    createDecisionHandler,
    createDecisionDocumentHandler,
    createDecisionEditionPreviewHandler,
    createReturnPreviewHandler,
    createReturnEvidenceHandler,
  ])(
    "denies unauthenticated requests before record/storage operations",
    async (factory) => {
      const f = fixture(null);
      expect((await factory(f.factory)(request(), context)).status).toBe(401);
      expect(f.value.leave.get).not.toHaveBeenCalled();
      expect(f.value.records.decisionDocument).not.toHaveBeenCalled();
    },
  );
  it("rejects foreign ownership before returning decision data", async () => {
    const f = fixture(owner);
    f.value.leave.get.mockRejectedValueOnce(
      new WorkflowError("FORBIDDEN", "Forbidden"),
    );
    expect(
      (await createDecisionHandler(f.factory)(request(), context)).status,
    ).toBe(403);
    expect(f.value.records.decision).not.toHaveBeenCalled();
  });
  it("forbids Pegawai from preview/apply without trusting role in body", async () => {
    const f = fixture(owner);
    expect(
      (
        await createReturnPreviewHandler(f.factory)(
          request("POST", { ...input, role: "ADMIN_KEPEGAWAIAN" }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createReturnHandlers(f.factory).POST(
          request("POST", input),
          context,
        )
      ).status,
    ).toBe(403);
    expect(f.value.records.apply).not.toHaveBeenCalled();
  });
  it("passes a stable retry key while excluding client-supplied actor/year/buckets", async () => {
    const f = fixture();
    const handler = createReturnHandlers(f.factory).POST;
    for (let i = 0; i < 2; i++)
      expect(
        (
          await handler(
            request("POST", {
              ...input,
              employeeId: "foreign",
              entitlementYear: 2020,
              bucket: "N",
            }),
            context,
          )
        ).status,
      ).toBe(201);
    expect(f.value.records.apply.mock.calls[0]).toEqual(
      f.value.records.apply.mock.calls[1],
    );
    expect(f.value.records.apply.mock.calls[0][2]).not.toHaveProperty(
      "employeeId",
    );
  });
  it("requires UUID retry keys and maps stale preview to 409", async () => {
    const f = fixture();
    expect(
      (
        await createReturnHandlers(f.factory).POST(
          request("POST", { ...input, idempotencyKey: "" }),
          context,
        )
      ).status,
    ).toBe(400);
    f.value.records.apply.mockRejectedValueOnce(
      new WorkflowError("CONFLICT", "Preview berubah"),
    );
    expect(
      (
        await createReturnHandlers(f.factory).POST(
          request("POST", input),
          context,
        )
      ).status,
    ).toBe(409);
  });
  it("serves an authenticated private final PDF with an honest failure response", async () => {
    const f = fixture(owner);
    const handler = createDecisionDocumentHandler(f.factory);
    const result = await handler(request(), context);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("content-disposition")).toContain(
      "arsip-final-disetujui",
    );
    f.value.records.decisionDocument.mockRejectedValueOnce(
      new WorkflowError("CONFLICT", "Verifikasi arsip lama diperlukan"),
    );
    expect((await handler(request(), context)).status).toBe(409);
  });
});

describe("decision edition delivery", () => {
  it("denies owner mutation and anonymous preview", async () => {
    const f = fixture(owner);
    expect(
      (
        await createDecisionEditionPreviewHandler(f.factory)(
          request("POST", {}),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createDecisionEditionHandlers(f.factory).POST(
          request("POST", {}),
          context,
        )
      ).status,
    ).toBe(403);
    const anon = fixture(null);
    expect(
      (
        await createDecisionEditionPreviewHandler(anon.factory)(
          request("POST", {}),
          context,
        )
      ).status,
    ).toBe(401);
  });
  it("returns private preview bytes and binds save input without client decision authority", async () => {
    const f = fixture();
    const data = {
      placement: { page: 1, left: 0.1, top: 0.7, width: 0.3, height: 0.1 },
      sourceChecksum: "test",
      confirmed: true,
      idempotencyKey: randomUUID(),
      previewFingerprint: "preview-bound",
      status: "REJECTED",
      reason: "forged",
    };
    const r = await createDecisionEditionPreviewHandler(f.factory)(
      request("POST", data),
      context,
    );
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-si-cuti-preview")).toBe("preview-bound");
    expect(
      (
        await createDecisionEditionHandlers(f.factory).POST(
          request("POST", data),
          context,
        )
      ).status,
    ).toBe(201);
    expect(f.value.records.saveDecisionEdition).toHaveBeenCalledWith(
      admin,
      id,
      data.placement,
      "test",
      data.idempotencyKey,
      true,
      "preview-bound",
    );
  });
});
