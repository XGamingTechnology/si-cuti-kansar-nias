// Isolated React component scenarios with synthetic HTTP responses; not a production server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const bundled = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {WorkflowWorkspace} from "./src/components/workflow-workspace";
    import {LeaveOutcomePanel} from "./src/components/leave-outcome-panel";
    const query=new URLSearchParams(location.search);
    createRoot(document.getElementById("root")!).render(<div className="admin-interface">{query.has("workspace") ? <WorkflowWorkspace role="ADMIN_KEPEGAWAIAN"/> : <LeaveOutcomePanel
      requestId="00000000-0000-4000-8000-000000000001" status={query.get("status")||"APPROVED"}
      admin={query.get("role")!=="PEGAWAI"} annual={query.get("status")!=="REJECTED"}
      signedDocuments={[{id:"00000000-0000-4000-8000-000000000002",version:1,originalFileName:"scan-sintetis.pdf"}]}/>}</div>);
  `,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
});
const css =
  (await readFile("src/app/styles.css", "utf8")) +
  (await readFile("src/components/admin-employee-ui.css", "utf8"));
const server = createServer(async (request, response) => {
  if (request.url.startsWith("/pdfjs/")) {
    response.setHeader(
      "content-type",
      request.url.endsWith(".mjs")
        ? "text/javascript"
        : request.url.endsWith(".wasm")
          ? "application/wasm"
          : "application/octet-stream",
    );
    response.end(
      await readFile(
        "public" + new URL(request.url, "http://localhost").pathname,
      ),
    );
    return;
  }
  if (request.url === "/app.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundled.outputFiles[0].text);
  } else if (request.url === "/style.css") {
    response.setHeader("content-type", "text/css");
    response.end(css);
  } else {
    response.setHeader("content-type", "text/html");
    response.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.SI_CUTI_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE }
    : {}),
});
let passed = 0;
const sourcePdf = await PDFDocument.create();
sourcePdf.addPage();
const pdf = Buffer.from(await sourcePdf.save());
async function pageFixture({
  role = "ADMIN",
  status = "APPROVED",
  legacy = false,
  abort = false,
  conflict = false,
  failReplacementUpload = false,
  invalidPreview = false,
} = {}) {
  const page = await browser.newPage({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let decision = legacy
    ? null
    : {
        id: "archive-synthetic",
        sourceDocumentId: "00000000-0000-4000-8000-000000000002",
        ready: true,
        snapshot: {
          status,
          employeeName: "Pegawai Uji",
          actorName: "Admin Uji",
          occurredAt: "2099-01-11T01:02:03Z",
          sourceDocumentVersion: 1,
          sourceChecksumSha256: "synthetic-checksum",
          reason: status === "REJECTED" ? "Dasar tidak lengkap" : null,
        },
      };
  const history = [],
    applies = [];
  const editions = [];
  let previews = 0,
    evidenceUploads = 0;
  await page.route("**/api/workflow/leave/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname.endsWith("/decision/editions/preview") && method === "GET")
      return route.fulfill({
        json: {
          sourceChecksum: "synthetic-checksum",
          pages: [{ page: 1, width: 595, height: 842, rotation: 0 }],
        },
      });
    if (pathname.endsWith("/decision/editions/preview"))
      return route.fulfill({
        contentType: "application/pdf",
        headers: { "x-si-cuti-preview": "stamp-preview" },
        body: invalidPreview ? Buffer.from("not-pdf") : pdf,
      });
    if (pathname.endsWith("/decision/editions")) {
      editions.push(route.request().postDataJSON());
      return route.fulfill({
        json: { edition: { id: "edition", version: 1 } },
      });
    }
    if (pathname.endsWith("/decision/document"))
      return route.fulfill({
        contentType: "application/pdf",
        headers: { "content-disposition": "attachment; filename=final.pdf" },
        body: pdf,
      });
    if (pathname.endsWith("/decision")) {
      if (method === "POST")
        decision = {
          id: "legacy-archive",
          sourceDocumentId: route.request().postDataJSON().documentId,
          ready: false,
          snapshot: {
            status,
            actorName: "Admin sumber keputusan",
            occurredAt: "2099-01-11T01:02:03Z",
            sourceDocumentVersion: 1,
            sourceChecksumSha256: "synthetic-checksum",
          },
        };
      return route.fulfill({ json: { decision } });
    }
    if (pathname.endsWith("/returns/evidence")) {
      evidenceUploads++;
      if (failReplacementUpload && evidenceUploads > 1)
        return route.fulfill({
          status: 400,
          json: { error: "PDF pengganti tidak valid." },
        });
      return route.fulfill({
        json: { document: { id: "00000000-0000-4000-8000-000000000003" } },
      });
    }
    if (pathname.endsWith("/returns/preview")) {
      previews++;
      return route.fulfill({
        json: {
          preview: {
            fingerprint: "fingerprint-synthetic",
            originalCommittedDays: 7,
            previouslyRestoredDays: 0,
            remainingCommittedDays: 7,
            allocations: [
              { bucket: "N1", days: 2 },
              { bucket: "N2", days: 3 },
            ],
            accountsBefore: [
              { bucket: "N1", availableDays: 4 },
              { bucket: "N2", availableDays: 0 },
            ],
            accountsAfterPreview: [
              { bucket: "N1", availableDays: 6 },
              { bucket: "N2", availableDays: 3 },
            ],
          },
        },
      });
    }
    if (pathname.endsWith("/returns")) {
      if (method === "GET")
        return route.fulfill({ json: { returns: history } });
      const input = route.request().postDataJSON();
      applies.push(input);
      if (conflict) {
        conflict = false;
        return route.fulfill({
          status: 409,
          json: { error: "Saldo berubah. Buat preview baru." },
        });
      }
      const result = {
        ...input,
        id: "return-synthetic",
        recordedAt: "2099-01-13T00:00:00Z",
      };
      history.push(result);
      if (abort) {
        abort = false;
        return route.abort("connectionreset");
      }
      return route.fulfill({ json: { return: result } });
    }
    if (pathname.includes("/documents/"))
      return route.fulfill({ contentType: "application/pdf", body: pdf });
    return route.fulfill({
      status: 404,
      json: { error: "Fixture route missing" },
    });
  });
  await page.goto(base + `/?role=${role}&status=${status}`);
  await page.getByRole("heading", { name: "Arsip Hasil Keputusan" }).waitFor();
  await page
    .getByText("Memuat arsip keputusan…")
    .waitFor({ state: "detached" });
  return { page, errors, history, applies, editions, previews: () => previews };
}
async function fillReturn(page) {
  await page.getByRole("button", { name: "Catat Pengembalian Cuti" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Pengembalian Saldo Cuti Tahunan",
  });
  await dialog.getByLabel("Hari kerja yang tidak digunakan").fill("5");
  await dialog
    .getByLabel("Alasan pengembalian")
    .fill("Penugasan resmi sintetis");
  await dialog.getByLabel("Nomor/referensi dasar resmi").fill("TUGAS-UJI-01");
  await dialog.getByLabel("Tanggal dasar resmi").fill("2099-01-13");
  await dialog.getByLabel("Bukti PDF pendukung").setInputFiles({
    name: "basis.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await dialog.getByText("Bukti PDF tersimpan.").waitFor();
  await dialog.getByRole("checkbox").check();
  return dialog;
}
async function scenario(name, work) {
  await work();
  passed++;
  console.log("PASS", name);
}
try {
  await scenario(
    "approved final download and exact original link",
    async () => {
      const f = await pageFixture();
      await f.page.getByText("FINAL · DISETUJUI DI SI CUTI").waitFor();
      assert.match(
        await f.page
          .getByRole("link", { name: "Lihat Scan Asli Sumber Keputusan" })
          .getAttribute("href"),
        /000000000002$/,
      );
      const download = f.page.waitForEvent("download");
      await f.page
        .getByRole("button", { name: "Unduh PDF Keputusan Final" })
        .click();
      assert.ok(await download);
      assert.deepEqual(f.errors, []);
      await f.page.close();
    },
  );
  await scenario("rejection reason and notice download", async () => {
    const f = await pageFixture({ status: "REJECTED" });
    await f.page.getByText("Alasan penolakan: Dasar tidak lengkap").waitFor();
    assert.equal(
      await f.page
        .getByRole("button", { name: "Catat Pengembalian Cuti" })
        .count(),
      0,
    );
    assert.equal(
      await f.page
        .getByRole("button", { name: "Unduh Hasil Penolakan" })
        .count(),
      1,
    );
    await f.page.close();
  });
  await scenario("Pegawai read-only outcome and history", async () => {
    const f = await pageFixture({ role: "PEGAWAI" });
    assert.equal(
      await f.page
        .getByRole("button", { name: "Catat Pengembalian Cuti" })
        .count(),
      0,
    );
    assert.equal(
      await f.page
        .getByRole("button", { name: "Unduh PDF Keputusan Final" })
        .count(),
      1,
    );
    await f.page.close();
  });
  await scenario(
    "preview does not apply; explicit confirm and audit refresh",
    async () => {
      const f = await pageFixture();
      const dialog = await fillReturn(f.page);
      await dialog
        .getByRole("button", { name: "Preview Pengembalian" })
        .click();
      await dialog
        .getByRole("button", { name: "Konfirmasi Pengembalian" })
        .waitFor();
      assert.equal(f.applies.length, 0);
      assert.equal(await dialog.locator("tbody tr").count(), 2);
      await dialog
        .getByRole("button", { name: "Konfirmasi Pengembalian" })
        .click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(f.applies.length, 1);
      assert.equal(f.applies[0].restoredDays, 5);
      assert.match(f.applies[0].idempotencyKey, /^[0-9a-f-]{36}$/);
      await f.page
        .getByText("Penugasan resmi sintetis", { exact: true })
        .waitFor();
      assert.deepEqual(f.errors, []);
      await f.page.close();
    },
  );
  await scenario(
    "failed replacement upload clears previous proof and preview",
    async () => {
      const f = await pageFixture({ failReplacementUpload: true });
      const d = await fillReturn(f.page);
      await d.getByRole("button", { name: "Preview Pengembalian" }).click();
      await d
        .getByRole("button", { name: "Konfirmasi Pengembalian" })
        .waitFor();
      await d.getByRole("button", { name: "Perbarui Preview" }).click();
      await d.getByLabel("Bukti PDF pendukung").setInputFiles({
        name: "replacement.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await d.getByText("PDF pengganti tidak valid.").waitFor();
      assert.equal(await d.getByText("Bukti PDF tersimpan.").count(), 0);
      assert.equal(
        await d
          .getByRole("button", { name: "Konfirmasi Pengembalian" })
          .count(),
        0,
      );
      assert.equal(
        await d
          .getByRole("button", { name: "Preview Pengembalian" })
          .isDisabled(),
        true,
      );
      assert.equal(f.applies.length, 0);
      await f.page.close();
    },
  );
  await scenario(
    "unknown response reconciles history without duplicate command",
    async () => {
      const f = await pageFixture({ abort: true });
      const d = await fillReturn(f.page);
      await d.getByRole("button", { name: "Preview Pengembalian" }).click();
      await d.getByRole("button", { name: "Konfirmasi Pengembalian" }).click();
      await d.waitFor({ state: "detached" });
      assert.equal(f.applies.length, 1);
      assert.equal(f.history.length, 1);
      await f.page.close();
    },
  );
  await scenario(
    "stale preview requires review and creates no history",
    async () => {
      const f = await pageFixture({ conflict: true });
      const d = await fillReturn(f.page);
      await d.getByRole("button", { name: "Preview Pengembalian" }).click();
      await d.getByRole("button", { name: "Konfirmasi Pengembalian" }).click();
      await d.getByRole("alert").waitFor();
      assert.equal(f.history.length, 0);
      await d.getByRole("button", { name: "Perbarui Preview" }).click();
      await d.getByRole("button", { name: "Preview Pengembalian" }).click();
      await d
        .getByRole("button", { name: "Konfirmasi Pengembalian" })
        .waitFor();
      assert.equal(f.previews(), 2);
      await f.page.close();
    },
  );
  await scenario(
    "mobile dialog keyboard containment and Escape focus restoration",
    async () => {
      const f = await pageFixture();
      await f.page.setViewportSize({ width: 390, height: 844 });
      const trigger = f.page.getByRole("button", {
        name: "Catat Pengembalian Cuti",
      });
      await trigger.click();
      const d = f.page.getByRole("dialog");
      const box = await d.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390);
      for (let i = 0; i < 12; i++) {
        await f.page.keyboard.press("Tab");
        assert.equal(
          await d.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      await f.page.keyboard.press("Escape");
      await d.waitFor({ state: "detached" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
      await f.page.close();
    },
  );
  await scenario(
    "legacy source is explicitly selected and attested",
    async () => {
      const f = await pageFixture({ legacy: true });
      assert.equal(
        await f.page
          .getByRole("button", { name: "Unduh PDF Keputusan Final" })
          .count(),
        0,
      );
      await f.page
        .getByLabel("Scan yang menjadi dasar keputusan")
        .selectOption("00000000-0000-4000-8000-000000000002");
      await f.page.getByRole("checkbox").check();
      await f.page
        .getByRole("button", { name: "Kunci Sumber Arsip Lama" })
        .click();
      await f.page
        .getByRole("button", { name: "Unduh PDF Keputusan Final" })
        .waitFor();
      assert.equal(f.applies.length, 0);
      await f.page.close();
    },
  );

  await scenario(
    "stamp preview, verification and edit invalidation",
    async () => {
      const f = await pageFixture();
      await f.page
        .getByRole("button", { name: "Atur Penanda pada Formulir" })
        .click();
      const d = f.page.getByRole("dialog", {
        name: "Penanda Keputusan pada Formulir",
      });
      const save = d.getByRole("button", { name: "Simpan Edisi Final" });
      assert.equal(await save.isDisabled(), true);
      await d.getByRole("button", { name: "Lihat Preview PDF" }).click();
      await d.getByRole("link", { name: "Buka preview di tab baru" }).waitFor();
      assert.equal(f.editions.length, 0);
      await d.getByRole("checkbox").check();
      assert.equal(await save.isEnabled(), true);
      await d.getByLabel("Posisi dari kiri (%)").fill("10");
      assert.equal(await save.isDisabled(), true);
      assert.equal(
        await d.getByRole("img", { name: /Preview penanda keputusan/ }).count(),
        0,
      );
      await d.getByRole("button", { name: "Lihat Preview PDF" }).click();
      await d.getByRole("link", { name: "Buka preview di tab baru" }).waitFor();
      await d.getByRole("checkbox").check();
      await save.click();
      await d.waitFor({ state: "detached" });
      assert.equal(f.editions.length, 1);
      assert.equal(f.editions[0].placement.left, 0.1);
      assert.equal(f.editions[0].previewFingerprint, "stamp-preview");
      assert.equal(f.editions[0].confirmed, true);
      assert.deepEqual(f.errors, []);
      await f.page.close();
    },
  );
  async function workspaceFixture(slow = false) {
    const page = await browser.newPage();
    const records = ["A", "B"].map((name, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      employeeId: `employee-${name}`,
      employee: {
        id: `employee-${name}`,
        nip: `UJI-${name}`,
        fullName: `Pegawai ${name}`,
        positionTitle: "Staf",
        workUnit: "Unit Uji",
        employmentStartDate: null,
        directSupervisor: null,
      },
      status: i ? "APPROVED" : "SUBMITTED",
      currentRevisionNumber: 1,
      currentRevision: {
        id: `revision-${name}`,
        leaveType: "ANNUAL",
        startDate: "2099-01-05",
        endDate: "2099-01-09",
        reason: `Alasan ${name}`,
        calculatedWorkingDays: 5,
        submittedAt: "2099-01-04T00:00:00Z",
      },
    }));
    await page.route("**/api/workflow/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("permission-types"))
        return route.fulfill({ json: { permissionTypes: [] } });
      if (path === "/api/workflow/leave")
        return route.fulfill({ json: { requests: records } });
      const record = records.find((r) => path.includes(r.id));
      if (!record)
        return route.fulfill({
          json: { error: "Fixture missing" },
          status: 404,
        });
      if (path.endsWith("/actions")) {
        record.status = "REJECTED";
        return route.fulfill({ json: { request: record } });
      }
      if (path.endsWith("/revisions")) {
        if (slow && record === records[0])
          await new Promise((resolve) => setTimeout(resolve, 600));
        return route.fulfill({
          json: {
            revisions: [{ ...record.currentRevision, revisionNumber: 1 }],
          },
        });
      }
      if (path.endsWith("/history"))
        return route.fulfill({ json: { history: [] } });
      if (path.endsWith("/documents"))
        return route.fulfill({ json: { documents: [] } });
      if (path.endsWith("/decision"))
        return route.fulfill({ json: { decision: null } });
      if (path.endsWith("/returns"))
        return route.fulfill({ json: { returns: [] } });
      return route.fulfill({ json: { request: record } });
    });
    await page.goto(base + "/?workspace=1");
    await page.locator(".request-card").first().waitFor();
    return page;
  }
  await scenario(
    "failed PDF page render blocks confirmation and saving",
    async () => {
      const f = await pageFixture({ invalidPreview: true });
      await f.page
        .getByRole("button", { name: "Atur Penanda pada Formulir" })
        .click();
      const d = f.page.getByRole("dialog", {
        name: "Penanda Keputusan pada Formulir",
      });
      await d.getByRole("button", { name: "Lihat Preview PDF" }).click();
      await d
        .getByText("Halaman PDF gagal ditampilkan.", { exact: false })
        .waitFor();
      assert.equal(await d.getByRole("checkbox").isDisabled(), true);
      assert.equal(
        await d
          .getByRole("button", { name: "Simpan Edisi Final" })
          .isDisabled(),
        true,
      );
      assert.equal(f.editions.length, 0);
      await f.page.close();
    },
  );
  await scenario(
    "rejection message clears when another request opens",
    async () => {
      const p = await workspaceFixture();
      await p.locator(".request-card").filter({ hasText: "Pegawai A" }).click();
      const detail = p.getByRole("dialog", { name: "Detail pengajuan" });
      await detail.getByRole("button", { name: "Tolak", exact: true }).click();
      const review = p.getByRole("dialog", { name: "Tolak pengajuan ini" });
      await review.getByLabel("Alasan penolakan").fill("Alasan uji");
      await review
        .getByRole("button", { name: "Tolak Pengajuan", exact: true })
        .click();
      await detail.getByText("Pengajuan ditolak.", { exact: true }).waitFor();
      await detail.getByRole("button", { name: "Tutup jendela" }).click();
      await p.locator(".request-card").filter({ hasText: "Pegawai B" }).click();
      await detail.getByText("Pegawai B", { exact: true }).waitFor();
      assert.equal(
        await detail.getByText("Pengajuan ditolak.", { exact: true }).count(),
        0,
      );
      await p.close();
    },
  );
  await scenario(
    "late detail response cannot replace a newer request",
    async () => {
      const p = await workspaceFixture(true);
      await p.locator(".request-card").filter({ hasText: "Pegawai A" }).click();
      const d = p.getByRole("dialog", { name: "Detail pengajuan" });
      await d.getByRole("button", { name: "Tutup jendela" }).click();
      await p.locator(".request-card").filter({ hasText: "Pegawai B" }).click();
      await d
        .locator(".revision-card")
        .getByText("Alasan B", { exact: true })
        .waitFor();
      await p.waitForTimeout(750);
      assert.equal(
        await d
          .locator(".revision-card")
          .getByText("Alasan A", { exact: true })
          .count(),
        0,
      );
      await p.close();
    },
  );
  console.log(`BROWSER_SCENARIOS_PASSED=${passed}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
