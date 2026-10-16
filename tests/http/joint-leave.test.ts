import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createJointLeaveHandler } from "@/application/joint-leave/delivery";
import type { JointLeaveService } from "@/application/joint-leave/service";
import { JointLeaveError } from "@/application/joint-leave/rules";
import type { Principal } from "@/modules/auth/service";
const owner: Principal = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Sintetis",
  role: "PEGAWAI",
};
const admin = { ...owner, role: "ADMIN_KEPEGAWAIAN" as const };
function setup(principal: Principal | null = owner) {
  const service = {
    list: vi.fn(async () => ({ claims: [], total: 0 })),
    configure: vi.fn(),
    submit: vi.fn(),
    get: vi.fn(),
    policies: vi.fn(async () => []),
    preview: vi.fn(),
    review: vi.fn(),
    evidence: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
    })),
    duplicates: vi.fn(async () => []),
  };
  const database = { $disconnect: vi.fn(async () => {}) };
  const factory = () => ({
    database,
    authentication: { validate: async () => principal },
    jointLeave: service as unknown as JointLeaveService,
  });
  return {
    service,
    database,
    handler: (a: Parameters<typeof createJointLeaveHandler>[0]) =>
      createJointLeaveHandler(a, factory),
  };
}
const url = "https://si-cuti.test/api/joint-leave";
const context = { params: Promise.resolve({ id: randomUUID() }) };
describe("Joint Leave HTTP boundary", () => {
  it("bounds an upload stream even when Content-Length is absent", async () => {
    const f = setup();
    const r = await f.handler("claims")(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        body: new Uint8Array(11 * 1024 * 1024 + 1),
      }),
    );
    expect(r.status).toBe(400);
    expect(f.service.submit).not.toHaveBeenCalled();
  });
  it.each([
    "claims",
    "policies",
    "duplicates",
    "detail",
    "evidence",
    "preview",
    "review",
  ] as const)("denies anonymous %s and disconnects", async (action) => {
    const f = setup(null),
      response = await f.handler(action)(new Request(url), context);
    expect(response.status).toBe(401);
    expect(f.database.$disconnect).toHaveBeenCalledOnce();
  });
  it.each(["preview", "review", "policies"] as const)(
    "denies employee %s before parsing body",
    async (action) => {
      const f = setup(),
        r = await f.handler(action)(
          new Request(url, { method: "POST", body: "broken" }),
          context,
        );
      expect(r.status).toBe(403);
      expect(f.service.preview).not.toHaveBeenCalled();
      expect(f.service.configure).not.toHaveBeenCalled();
    },
  );
  it("denies Admin submission before reading uploads", async () => {
    const f = setup(admin);
    expect(
      (await f.handler("claims")(new Request(url, { method: "POST" }))).status,
    ).toBe(403);
    expect(f.service.submit).not.toHaveBeenCalled();
  });
  it("wires owner-scoped filters without accepting an employee target from query", async () => {
    const f = setup();
    const r = await f.handler("claims")(
      new Request(
        url + "?year=2026&page=2&status=REJECTED&search=Ops&employeeId=foreign",
      ),
    );
    expect(r.status).toBe(200);
    expect(f.service.list).toHaveBeenCalledWith(owner, {
      year: 2026,
      page: 2,
      status: "REJECTED",
      search: "Ops",
    });
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects malformed/unexpected authority in review payload", async () => {
    const f = setup(admin),
      r = await f.handler("review")(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            employeeId: randomUUID(),
            approvedEventIds: [],
            reason: "test",
            evidenceVerified: false,
            idempotencyKey: randomUUID(),
            fingerprint: "",
          }),
        }),
        context,
      );
    expect(r.status).toBe(400);
    expect(f.service.review).not.toHaveBeenCalled();
  });
  it("streams only authorized evidence with private/sandbox headers", async () => {
    const f = setup();
    const r = await f.handler("evidence")(new Request(url), context);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toContain("sandbox");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it("maps a duplicate to 409, hides unexpected internal errors and always disconnects", async () => {
    const f = setup();
    f.service.duplicates.mockRejectedValueOnce(
      new JointLeaveError("CONFLICT", "Tanggal sudah diklaim"),
    );
    const r = await f.handler("duplicates")(
      new Request(url + "?dates=2026-01-01"),
    );
    expect(r.status).toBe(409);
    f.service.duplicates.mockRejectedValueOnce(
      new Error("postgresql://secret"),
    );
    const e = await f.handler("duplicates")(new Request(url));
    expect(e.status).toBe(500);
    expect(await e.text()).not.toContain("secret");
    expect(f.database.$disconnect).toHaveBeenCalledTimes(2);
  });
});
