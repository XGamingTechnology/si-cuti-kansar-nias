import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { MAX_ARTIFACT } from "@/application/reporting/contracts";
import { reportFilters, reportRow } from "../support/reporting";
import { reportingFixture } from "../support/reporting-memory";
const input = (extra: object = {}) => ({
  ...reportFilters(),
  idempotencyKey: randomUUID(),
  ...extra,
});
describe("M7 application snapshot and fail-closed boundary", () => {
  it("only active Admin owner can create/read/export/download, including after demotion", async () => {
    const f = reportingFixture();
    await expect(f.service.create(f.employee, input())).rejects.toMatchObject({
      status: 403,
    });
    const p = await f.service.create(f.a, input()),
      id = p.run.id;
    await expect(
      f.service.read(f.b, id, new URLSearchParams()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.export(f.b, id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    f.flags.active = false;
    await expect(
      f.service.read(f.a, id, new URLSearchParams()),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.events().some((e) => e.resultCode === "FORBIDDEN")).toBe(true);
  });
  it("freezes one dataset despite later identity/status/return changes, with no sensitive projection", async () => {
    const f = reportingFixture(),
      p = await f.service.create(f.a, input());
    f.rows[0].name = "Nama baru";
    f.rows[0].status = "REJECTED";
    f.rows[0].hasBalanceReturn = false;
    const current = await f.service.read(f.a, p.run.id, new URLSearchParams());
    expect(current.items).toEqual(p.items);
    await f.service.export(f.a, p.run.id, {
      format: "PDF",
      idempotencyKey: randomUUID(),
    });
    await f.service.export(f.a, p.run.id, {
      format: "XLSX",
      idempotencyKey: randomUUID(),
    });
    expect(f.renderers.render.mock.calls[0][1]).toEqual(
      f.renderers.render.mock.calls[1][1],
    );
    expect(f.reader.read).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(current)).not.toMatch(
      /datasetKey|storageKey|reason|leavePhone|evidence/,
    );
  });
  it("retries identical actor/payload once and rejects key reuse across filters/format/run", async () => {
    const f = reportingFixture(),
      v = input(),
      p = await f.service.create(f.a, v);
    expect((await f.service.create(f.a, v)).run.id).toBe(p.run.id);
    expect(f.runs()).toHaveLength(1);
    expect(f.reader.read).toHaveBeenCalledTimes(1);
    await expect(
      f.service.create(f.a, { ...v, status: "REJECTED" }),
    ).rejects.toMatchObject({ code: "RETRY_CONFLICT" });
    const key = randomUUID(),
      a = await f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: key,
      });
    expect(
      (
        await f.service.export(f.a, p.run.id, {
          format: "PDF",
          idempotencyKey: key,
        })
      ).artifact.id,
    ).toBe(a.artifact.id);
    const alias = randomUUID();
    expect(
      (
        await f.service.export(f.a, p.run.id, {
          format: "PDF",
          idempotencyKey: alias,
        })
      ).artifact.id,
    ).toBe(a.artifact.id);
    await expect(
      f.service.export(f.a, p.run.id, {
        format: "XLSX",
        idempotencyKey: alias,
      }),
    ).rejects.toMatchObject({ code: "RETRY_CONFLICT" });
    expect(f.artifacts()).toHaveLength(1);
    expect(f.renderers.render).toHaveBeenCalledTimes(1);
  });
  it("server pagination binds cursor to run and count, rejects tampering and invalid limit", async () => {
    const f = reportingFixture();
    f.rows.push(...Array.from({ length: 29 }, () => reportRow()));
    const p = await f.service.create(f.a, input());
    expect(p.items).toHaveLength(25);
    expect(p.nextCursor).toBeTruthy();
    const next = await f.service.read(
      f.a,
      p.run.id,
      new URLSearchParams({ cursor: p.nextCursor!, limit: "25" }),
    );
    expect(next.items).toHaveLength(6);
    expect(next.offset).toBe(25);
    expect(next.summary.requests).toBe(31);
    await expect(
      f.service.read(
        f.a,
        p.run.id,
        new URLSearchParams({ cursor: p.nextCursor! + "x" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    for (const q of ["limit=101", "limit=0", "limit=1&limit=2", "unknown=x"])
      await expect(
        f.service.read(f.a, p.run.id, new URLSearchParams(q)),
      ).rejects.toMatchObject({ code: "INVALID_PAGE" });
  });
  it("enforces expiry at exactly 24h on retry/read/export/download even before purger", async () => {
    const f = reportingFixture(),
      v = input(),
      p = await f.service.create(f.a, v),
      a = await f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      });
    f.setNow(new Date(new Date(p.run.expiresAt).getTime() - 1));
    await expect(
      f.service.download(f.a, p.run.id, a.artifact.id),
    ).resolves.toHaveProperty("bytes");
    f.setNow(new Date(p.run.expiresAt));
    for (const op of [
      () => f.service.create(f.a, v),
      () => f.service.read(f.a, p.run.id, new URLSearchParams()),
      () =>
        f.service.export(f.a, p.run.id, {
          format: "XLSX",
          idempotencyKey: randomUUID(),
        }),
      () => f.service.download(f.a, p.run.id, a.artifact.id),
    ])
      await expect(op()).rejects.toMatchObject({ code: "REPORT_EXPIRED" });
    expect(f.storage.size).toBe(2);
  });
  it("rolls metadata and bytes back if ready audit fails; audit outage never returns a result", async () => {
    const f = reportingFixture();
    f.flags.auditFailure = "RUN_READY";
    await expect(f.service.create(f.a, input())).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
    expect(f.runs()).toHaveLength(0);
    expect(f.storage.size).toBe(0);
    expect(f.events().some((e) => e.event === "RUN_FAILED")).toBe(true);
    f.flags.auditFailure = "all";
    await expect(f.service.create(f.a, input())).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
  });
  it("fails closed on download audit failure and checksum corruption", async () => {
    const f = reportingFixture(),
      p = await f.service.create(f.a, input()),
      a = await f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      });
    f.flags.auditFailure = "DOWNLOAD_AUTHORIZED";
    await expect(
      f.service.download(f.a, p.run.id, a.artifact.id),
    ).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE" });
    f.flags.auditFailure = "";
    f.storage.set(f.artifacts()[0].storageKey, Buffer.from("tampered"));
    await expect(
      f.service.download(f.a, p.run.id, a.artifact.id),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
  it("render/storage failure keeps snapshot retryable without duplicate artefacts", async () => {
    const f = reportingFixture(),
      p = await f.service.create(f.a, input()),
      key = randomUUID();
    f.flags.renderFailure = true;
    await expect(
      f.service.export(f.a, p.run.id, { format: "PDF", idempotencyKey: key }),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.artifacts()).toHaveLength(0);
    f.flags.renderFailure = false;
    f.flags.writeFailure = true;
    await expect(
      f.service.export(f.a, p.run.id, { format: "PDF", idempotencyKey: key }),
    ).rejects.toMatchObject({ status: 503 });
    f.flags.writeFailure = false;
    await f.service.export(f.a, p.run.id, {
      format: "PDF",
      idempotencyKey: key,
    });
    expect(f.artifacts()).toHaveLength(1);
    expect(f.reader.read).toHaveBeenCalledTimes(1);
  });
  it("rejects row/artifact limits and query timeout without publishing partial results", async () => {
    const f = reportingFixture();
    f.rows.push(...Array.from({ length: 999 }, () => reportRow()));
    await expect(f.service.create(f.a, input())).rejects.toMatchObject({
      code: "REPORT_TOO_LARGE",
    });
    expect(f.files.put).not.toHaveBeenCalled();
    f.rows.splice(0, 1001);
    f.flags.readerFailure = true;
    await expect(f.service.create(f.a, input())).rejects.toMatchObject({
      code: "QUERY_UNAVAILABLE",
    });
    f.flags.readerFailure = false;
    const p = await f.service.create(f.a, input());
    f.renderers.render.mockImplementationOnce(async () =>
      Buffer.alloc(MAX_ARTIFACT + 1),
    );
    await expect(
      f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOO_LARGE" });
    expect(f.artifacts()).toHaveLength(0);
  });
  it("does not publish an artifact if the run expires during rendering", async () => {
    const f = reportingFixture(),
      p = await f.service.create(f.a, input());
    f.renderers.render.mockImplementationOnce(async () => {
      f.setNow(new Date(p.run.expiresAt));
      return Buffer.from("finished after expiry");
    });
    await expect(
      f.service.export(f.a, p.run.id, {
        format: "PDF",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "REPORT_EXPIRED" });
    expect(f.artifacts()).toHaveLength(0);
    expect(f.storage.size).toBe(1);
  });
  it("redacts private searches in all persisted metadata/events, not in private dataset", async () => {
    const f = reportingFixture(),
      p = await f.service.create(f.a, input({ search: "NIP-PRIVATE-123" }));
    expect(JSON.stringify(f.runs())).not.toContain("NIP-PRIVATE-123");
    expect(JSON.stringify(f.events())).not.toContain("NIP-PRIVATE-123");
    expect(p.run.filters.search).toBe("NIP-PRIVATE-123");
  });
});
