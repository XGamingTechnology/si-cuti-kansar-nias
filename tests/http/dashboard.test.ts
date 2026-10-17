import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createDashboardHandler,
  type DashboardResource,
} from "@/application/dashboard/http";
import { DashboardService } from "@/application/dashboard/contracts";
import { OverlayService } from "@/application/dashboard/overlay";
const admin = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Admin Test",
  role: "ADMIN_KEPEGAWAIAN",
};
const owner = { ...admin, role: "PEGAWAI" };
function deps(principal: unknown = admin) {
  const reader = {
    summary: vi.fn(async () => ({ fixed: {}, groups: [], types: [] })),
    agenda: vi.fn(async () => ({ items: [], total: 0 })),
    calendar: vi.fn(async () => ({ days: [], uniqueRequestCount: 0 })),
    balance: vi.fn(async () => ({ readiness: "UNINITIALIZED" })),
    employees: vi.fn(async () => []),
  };
  const overlay = {
    latest: vi.fn(async () => null),
    history: vi.fn(async () => []),
    publish: vi.fn(),
  };
  return {
    reader,
    overlay,
    runtime: {
      authentication: { validate: vi.fn(async () => principal) },
      dashboard: new DashboardService(reader as never),
      overlays: new OverlayService(overlay),
      database: { $disconnect: vi.fn() },
    },
  };
}
function request(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: "si_cuti_session=token",
      "content-type": "application/json",
      "x-role": "ADMIN_KEPEGAWAIAN",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const paths: Record<DashboardResource, string> = {
  summary: "/api/dashboard/summary?kind=leave",
  calendar: "/api/calendar?kind=leave",
  agenda: "/api/calendar/agenda?kind=permission",
  balance: "/api/dashboard/balance",
  employees: "/api/dashboard/employees",
  overlays: "/api/calendar/overlays?year=2027",
  "overlay-history": "/api/admin/calendar-overlays?year=2027",
  "overlay-preview": "/api/admin/calendar-overlays/preview",
  "overlay-publish": "/api/admin/calendar-overlays/publish",
};
describe("M6 HTTP boundaries", () => {
  it.each(Object.keys(paths) as DashboardResource[])(
    "requires a session before parsing %s",
    async (resource) => {
      const d = deps(null);
      const res = await createDashboardHandler(
        resource,
        () => d.runtime as never,
      )(
        request(
          paths[resource],
          resource.includes("preview") || resource.includes("publish")
            ? {}
            : undefined,
        ),
      );
      expect(res.status).toBe(401);
      expect(d.runtime.database.$disconnect).toHaveBeenCalled();
    },
  );
  it.each([
    "employees",
    "overlay-history",
    "overlay-preview",
    "overlay-publish",
  ] as DashboardResource[])("rejects Pegawai %s", async (resource) => {
    const d = deps(owner);
    expect(
      (
        await createDashboardHandler(
          resource,
          () => d.runtime as never,
        )(
          request(
            paths[resource],
            resource.includes("preview") || resource.includes("publish")
              ? {}
              : undefined,
          ),
        )
      ).status,
    ).toBe(403);
    expect(d.overlay.publish).not.toHaveBeenCalled();
  });
  it("rejects forged employee scope before reading and uses session for self saldo", async () => {
    const d = deps(owner);
    const h = (r: DashboardResource) =>
      createDashboardHandler(r, () => d.runtime as never);
    expect(
      (
        await h("agenda")(
          request(`/api/calendar/agenda?kind=leave&employeeId=${randomUUID()}`),
        )
      ).status,
    ).toBe(403);
    expect(d.reader.agenda).not.toHaveBeenCalled();
    expect((await h("balance")(request(paths.balance))).status).toBe(200);
    expect(d.reader.balance).toHaveBeenCalledWith(
      owner.employeeId,
      expect.any(Number),
    );
  });
  it("Admin may read minimal calendar and no-store policy is returned", async () => {
    const d = deps();
    const response = await createDashboardHandler(
      "calendar",
      () => d.runtime as never,
    )(request(paths.calendar));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      timeZone: "Asia/Jakarta",
      days: [],
    });
  });
  it("rejects unknown filter, malformed JSON and oversized chunked body", async () => {
    const d = deps();
    const get = createDashboardHandler("summary", () => d.runtime as never);
    expect(
      (await get(request("/api/dashboard/summary?kind=leave&reason=x"))).status,
    ).toBe(422);
    const post = createDashboardHandler(
      "overlay-preview",
      () => d.runtime as never,
    );
    expect(
      (
        await post(
          new Request("http://localhost", {
            method: "POST",
            headers: { cookie: "si_cuti_session=t" },
            body: "{broken",
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await post(
          request("/api/admin/calendar-overlays/preview", {
            sourceReference: "x".repeat(300001),
          }),
        )
      ).status,
    ).toBe(422);
  });
  it("does not leak infrastructure errors", async () => {
    const d = deps();
    d.reader.calendar.mockRejectedValueOnce(new Error("secret storage key"));
    const response = await createDashboardHandler(
      "calendar",
      () => d.runtime as never,
    )(request(paths.calendar));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
