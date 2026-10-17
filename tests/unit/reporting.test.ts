import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  utimes,
  symlink,
  mkdir,
  chmod,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import {
  parseFilters,
  summary,
  redact,
  checksum,
} from "@/application/reporting/contracts";
import {
  renderReportPDF,
  renderReportXLSX,
  isoWIB,
  columnName,
} from "@/infrastructure/reporting/renderers";
import { LocalReportFiles } from "@/infrastructure/reporting/files";
import { purgeReportFiles } from "@/infrastructure/reporting/cleanup";
import { reportRow, reportFilters, reportDataset } from "../support/reporting";
function input(extra: object = {}) {
  return { ...reportFilters(), idempotencyKey: randomUUID(), ...extra };
}
function unzip(bytes: Uint8Array) {
  const b = Buffer.from(bytes),
    out = new Map<string, string>();
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const size = b.readUInt32LE(p + 18),
      n = b.readUInt16LE(p + 26),
      x = b.readUInt16LE(p + 28),
      name = b.subarray(p + 30, p + 30 + n).toString(),
      start = p + 30 + n + x;
    out.set(name, b.subarray(start, start + size).toString());
    p = start + size;
  }
  return out;
}
describe("M7 contracts and real renderers", () => {
  it.each([
    { status: "DRAFT" },
    { reportCode: "BALANCE" },
    { from: "2026-02-30" },
    { from: "2027-01-04" },
    { from: "2025-01-01", to: "2026-01-02" },
    { from: "1899-01-01" },
    { type: "permission-id" },
    { employeeId: "other" },
    { limit: 999 },
    { reason: "PRIVATE" },
  ])("rejects invalid/report-private filter %j", (extra) =>
    expect(() => parseFilters(input(extra))).toThrow(),
  );
  it("defaults approved, accepts leap day/366 days and rejects wrong type category", () => {
    const value = input({
      from: "2024-01-01",
      to: "2024-12-31",
      status: undefined,
    });
    expect(parseFilters(value).filters.status).toBe("APPROVED");
    expect(() =>
      parseFilters(
        input({ reportCode: "PERMISSION_REQUESTS", type: "ANNUAL" }),
      ),
    ).toThrow();
    expect(() =>
      parseFilters(input({ from: "2024-02-29", to: "2024-02-29" })),
    ).not.toThrow();
  });
  it("counts requests, unique employees and return markers separately", () => {
    const a = reportRow(),
      b = reportRow({ employeeId: a.employeeId, hasBalanceReturn: false });
    expect(summary([a, b])).toMatchObject({
      requests: 2,
      employees: 1,
      withBalanceReturn: 1,
    });
  });
  it("redacts name/NIP search with a keyed digest", () => {
    const a = redact("a".repeat(32), reportFilters({ search: "NIP-RAHASIA" })),
      b = redact("b".repeat(32), reportFilters({ search: "NIP-RAHASIA" }));
    expect(JSON.stringify(a)).not.toContain("NIP-RAHASIA");
    expect(a).not.toEqual(b);
  });
  it("formats timestamp WIB without date-only coercion", () => {
    expect(isoWIB("2026-12-31T16:59:59.999Z")).toBe(
      "2026-12-31T23:59:59.999+07:00",
    );
    expect(isoWIB("2026-12-31T17:00:00.000Z")).toBe(
      "2027-01-01T00:00:00.000+07:00",
    );
  });
  it("XLSX has 3 actual sheets, numeric counts, null cells and string-only identity/formula-like content", () => {
    const d = reportDataset([
      reportRow({
        name: '\t=HYPERLINK("evil") & < >',
        nip: "001234567890123456",
        workingDays: null,
      }),
      reportRow({ name: "@SUM(1,1)", workingDays: 0 }),
    ]);
    const files = unzip(renderReportXLSX(d)),
      data = files.get("xl/worksheets/sheet2.xml")!,
      meta = files.get("xl/worksheets/sheet1.xml")!;
    expect(files.size).toBe(8);
    expect(files.get("xl/workbook.xml")).toContain('name="Data"');
    expect(data).toContain('r="F2" t="inlineStr"');
    expect(data).toContain("001234567890123456");
    expect(data).toContain("&amp; &lt; &gt;");
    expect(data).toContain('<c r="O2"/>');
    expect(data).toContain('<c r="O3"><v>0</v></c>');
    expect(data).not.toMatch(/<f[ >]|<hyperlink|externalLink|vbaProject/);
    expect(meta).toContain(checksum(Buffer.from(JSON.stringify(d))));
    expect(columnName(26)).toBe("AA");
  });
  it.each(["=1+1", "+SUM(1,2)", "-2+3", "@SUM(1)", "\r\t=1"])(
    "keeps %j as XLSX text",
    (v) => {
      const xml = unzip(
        renderReportXLSX(reportDataset([reportRow({ name: v })])),
      ).get("xl/worksheets/sheet2.xml")!;
      expect(xml).toContain('r="G2" t="inlineStr"');
      expect(xml).not.toContain("<f>");
    },
  );
  it("permission XLSX omits annual-day and return columns", () => {
    const xml = unzip(
      renderReportXLSX(
        reportDataset(
          [
            reportRow({
              typeCode: "UJI",
              typeLabel: "Izin Uji",
              workingDays: null,
              hasBalanceReturn: false,
            }),
          ],
          reportFilters({ reportCode: "PERMISSION_REQUESTS" }),
        ),
      ),
    ).get("xl/worksheets/sheet2.xml")!;
    expect(xml).not.toContain("Hari kerja tahunan");
    expect(xml).not.toContain("pengembalian saldo");
  });
  it("creates readable A4 landscape PDF and repeated pages with long wrapped fields", async () => {
    const bytes = await renderReportPDF(
      reportDataset(
        Array.from({ length: 35 }, () =>
          reportRow({
            name: "Pegawai Sintetis Dengan Nama Panjang ".repeat(4),
            workUnit: "Unit Pencarian dan Pertolongan Sintetis",
          }),
        ),
      ),
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(841.89, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(595.28, 1);
  });
  it("renders empty PDF and enforces page, row-height and render time bounds", async () => {
    expect(
      (
        await PDFDocument.load(await renderReportPDF(reportDataset([])))
      ).getPageCount(),
    ).toBe(1);
    await expect(
      renderReportPDF(
        reportDataset(Array.from({ length: 30 }, () => reportRow())),
        { maxPages: 1 },
      ),
    ).rejects.toMatchObject({ code: "PDF_TOO_LARGE" });
    await expect(
      renderReportPDF(reportDataset([reportRow({ name: "x\n".repeat(120) })])),
    ).rejects.toMatchObject({ code: "PDF_ROW_TOO_TALL" });
    await expect(
      renderReportPDF(reportDataset(), { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
  });
});
describe("M7 dedicated storage and controlled-clock cleanup", () => {
  it("never accepts domain storage, public storage, or unmarked nonempty roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "m7-guard-"));
    try {
      expect(() => new LocalReportFiles(root, root)).toThrow();
      await expect(
        purgeReportFiles(new LocalReportFiles(root, root + "-docs")),
      ).rejects.toThrow();
      expect(
        () =>
          new LocalReportFiles(join(process.cwd(), "public", "reports"), root),
      ).toThrow();
      await writeFile(join(root, "domain-file"), "KEEP");
      await expect(
        new LocalReportFiles(root, root + "-docs").initialize(),
      ).rejects.toThrow();
      expect(await readFile(join(root, "domain-file"), "utf8")).toBe("KEEP");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("purges dataset/artifacts/orphan temp after 24h, retries safely and surfaces backlog", async () => {
    const root = await mkdtemp(join(tmpdir(), "m7-purge-")),
      now = new Date("2026-10-17T03:00:00Z"),
      old = new Date(now.getTime() - 37 * 3600000),
      files = new LocalReportFiles(root, root + "-domain", () => old);
    try {
      const a = await files.put(Buffer.from("dataset")),
        b = await files.put(Buffer.from("pdf")),
        c = await files.put(Buffer.from("xlsx"));
      const temp = join(
        root,
        a.key.slice(0, 2),
        `${a.key}.${randomUUID()}.tmp`,
      );
      await writeFile(temp, "orphan");
      await utimes(temp, old, old);
      const recent = new LocalReportFiles(root, root + "-domain", () => now);
      const fresh = await recent.put(Buffer.from("KEEP"));
      const check = await purgeReportFiles(files, { now, dryRun: true });
      expect(check).toMatchObject({
        eligible: 4,
        overdue36h: 4,
        healthy: false,
      });
      const done = await purgeReportFiles(files, { now });
      expect(done).toMatchObject({ deleted: 4, failed: 0, healthy: true });
      await expect(files.read(a.key, 20)).rejects.toThrow();
      await expect(files.read(b.key, 20)).rejects.toThrow();
      await expect(files.read(c.key, 20)).rejects.toThrow();
      expect(Buffer.from(await files.read(fresh.key, 20)).toString()).toBe(
        "KEEP",
      );
      expect((await purgeReportFiles(files, { now })).deleted).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("surfaces failed deletion backlog and succeeds on a later retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "m7-retry-")),
      now = new Date("2026-10-17T03:00:00Z"),
      files = new LocalReportFiles(
        root,
        root + "-docs",
        () => new Date(now.getTime() - 49 * 3600000),
      );
    let dir = "";
    try {
      const v = await files.put(Buffer.from("expired report"));
      dir = join(root, v.key.slice(0, 2));
      await chmod(dir, 0o500);
      const failure = await purgeReportFiles(files, { now });
      expect(failure).toMatchObject({
        failed: 1,
        overdue48h: 1,
        remainingEligible: 1,
        healthy: false,
      });
      await chmod(dir, 0o700);
      expect(await purgeReportFiles(files, { now })).toMatchObject({
        failed: 0,
        deleted: 1,
        healthy: true,
      });
    } finally {
      if (dir) await chmod(dir, 0o700);
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects oversized reads, traversal and symlinks, preserving unknown files", async () => {
    const root = await mkdtemp(join(tmpdir(), "m7-size-")),
      files = new LocalReportFiles(root, root + "-docs");
    try {
      const v = await files.put(Buffer.alloc(100));
      await expect(files.read(v.key, 99)).rejects.toMatchObject({
        code: "STORAGE_UNAVAILABLE",
      });
      await expect(files.read("../domain", 100)).rejects.toThrow();
      await mkdir(join(root, "ff"), { recursive: true });
      await symlink(
        join(root, ".si-cuti-m7-report-storage"),
        join(root, "ff", "f".repeat(32)),
      );
      const result = await purgeReportFiles(files, {
        now: new Date(Date.now() + 100 * 3600000),
      });
      expect(result.failed).toBe(1);
      expect(result.healthy).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
