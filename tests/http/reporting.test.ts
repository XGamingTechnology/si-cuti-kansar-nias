import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createReportHandler } from "@/application/reporting/http";
import { reportingFixture } from "../support/reporting-memory";
import { reportFilters } from "../support/reporting";
function fixture() {
  const f = reportingFixture(),
    validate = vi.fn(async () => f.a as typeof f.a | null),
    disconnect = vi.fn(async () => {});
  return {
    ...f,
    validate,
    disconnect,
    factory: () => ({
      authentication: { validate },
      reporting: f.service,
      database: { $disconnect: disconnect },
    }),
  };
}
const post = (data: unknown) =>
  new Request("http://localhost/api/reports/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
const context = (id: string, artifactId?: string) => ({
  params: Promise.resolve({ id, artifactId }),
});
describe("M7 HTTP server-authorized projections", () => {
  it("anonymous denied and connection always disconnected", async () => {
    const f = fixture();
    f.validate.mockResolvedValueOnce(null);
    const r = await createReportHandler("create", f.factory)(post({}));
    expect(r.status).toBe(401);
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.reader.read).not.toHaveBeenCalled();
  });
  it("Pegawai denied before malformed body or object lookup and denial is audited", async () => {
    const f = fixture();
    f.validate.mockResolvedValue(f.employee as unknown as typeof f.a);
    const r = await createReportHandler(
      "create",
      f.factory,
    )(new Request("http://localhost", { method: "POST", body: "not-json" }));
    expect(r.status).toBe(403);
    expect(f.events().at(-1)?.resultCode).toBe("FORBIDDEN");
  });
  it("bounded JSON errors are audited and audit failure closes response", async () => {
    const f = fixture(),
      handler = createReportHandler("create", f.factory);
    let r = await handler(
      new Request("http://localhost", { method: "POST", body: "[" }),
    );
    expect(r.status).toBe(422);
    expect(f.events().at(-1)?.event).toBe("REQUEST_REJECTED");
    f.flags.auditFailure = "all";
    r = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: "x".repeat(17000),
      }),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("AUDIT_UNAVAILABLE");
  });
  it("preview is no-store and contains only report allowlist, B cannot read A run", async () => {
    const f = fixture(),
      r = await createReportHandler(
        "create",
        f.factory,
      )(post({ ...reportFilters(), idempotencyKey: randomUUID() })),
      p = await r.json();
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(p)).not.toMatch(
      /storageKey|datasetKey|reason|leaveAddress|leavePhone|evidence/,
    );
    f.validate.mockResolvedValue(f.b);
    const denied = await createReportHandler("read", f.factory)(
      new Request("http://localhost"),
      context(p.run.id),
    );
    expect(denied.status).toBe(403);
  });
  it("download audits before bytes and revalidates session after IO", async () => {
    const f = fixture(),
      p = await f.service.create(f.a, {
        ...reportFilters(),
        idempotencyKey: randomUUID(),
      }),
      a = await f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      });
    const handler = createReportHandler("download", f.factory);
    let r = await handler(
      new Request("http://localhost"),
      context(p.run.id, a.artifact.id),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("attachment;");
    expect(f.events().at(-1)?.event).toBe("DOWNLOAD_AUTHORIZED");
    f.validate.mockResolvedValueOnce(f.a).mockResolvedValueOnce(null);
    r = await handler(
      new Request("http://localhost"),
      context(p.run.id, a.artifact.id),
    );
    expect(r.status).toBe(401);
  });
});
