// Synthetic intercepted-API React scenarios. These are not database end-to-end tests.
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
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `import React from "react";import {createRoot} from "react-dom/client";import {JointLeaveWorkspace} from "./src/components/joint-leave-workspace";import {AuthenticatedShell} from "./src/components/authenticated-shell";const q=new URLSearchParams(location.search);createRoot(document.getElementById("root")!).render(q.has("shell")?<AuthenticatedShell principal={{userId:"synthetic",employeeId:"synthetic",fullName:"Pegawai Sintetis",role:"PEGAWAI"}} initialAdminSurface="klaim"/>:<div className="admin-interface"><JointLeaveWorkspace admin={q.has("admin")}/></div>);`,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  outdir: "/tmp/si-cuti-joint-browser",
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css =
  (await readFile("src/app/styles.css", "utf8")) +
  (await readFile("src/components/admin-employee-ui.css", "utf8")) +
  (result.outputFiles.find((f) => f.path.endsWith(".css"))?.text || "");
const server = createServer((q, r) => {
  if (q.url === "/app.js") {
    r.setHeader("content-type", "text/javascript");
    r.end(js);
  } else if (q.url === "/style.css") {
    r.setHeader("content-type", "text/css");
    r.end(css);
  } else {
    r.setHeader("content-type", "text/html");
    r.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.SI_CUTI_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE }
    : {}),
});
const year = Number(
  new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(new Date()),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p = {
  id: id(1),
  name: "Tanggal Sintetis",
  creditYear: year,
  quotaDays: 2,
  isActive: true,
  sourceReference: "DASAR SINTETIS",
  eventDates: [
    {
      id: id(2),
      date: `${year}-01-01`,
      name: "Tanggal Uji A",
      kind: "REGULAR",
    },
    {
      id: id(3),
      date: `${year}-01-02`,
      name: "Tanggal Uji B",
      kind: "REGULAR",
    },
  ],
};
const pdf = await PDFDocument.create();
pdf.addPage([300, 300]);
const bytes = Buffer.from(await pdf.save());
let passed = 0;
async function fixture({
  admin = false,
  shell = false,
  status = "SUBMITTED",
  blocked = [],
  failSubmit = false,
  reviewConflict = false,
  mobile = false,
} = {}) {
  const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
    }),
    errors = [],
    submits = [],
    reviews = [],
    configurations = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let c = {
    id: id(4),
    employeeName: "Pegawai Sintetis",
    employeeNip: "TEST-JLC",
    title: "Penugasan Uji",
    assignmentType: "OPERATIONS",
    sprinNumber: null,
    creditYear: year,
    policyId: p.id,
    policySnapshot: p,
    status,
    submittedAt: `${year}-02-01T00:00:00Z`,
    reason: status === "REJECTED" ? "Bukti belum sesuai" : null,
    reviewedAt: status === "SUBMITTED" ? null : `${year}-02-02T00:00:00Z`,
    dates: p.eventDates.map((e, n) => ({
      id: id(n + 10),
      eventId: e.id,
      eventDate: e.date,
      status: status === "REJECTED" ? "REJECTED" : "PENDING",
    })),
  };
  await page.route("**/api/joint-leave**", async (route) => {
    const q = route.request(),
      url = new URL(q.url()),
      path = url.pathname;
    if (path.endsWith("/policies")) {
      if (q.method() === "POST") configurations.push(q.postDataJSON());
      return route.fulfill({
        json: q.method() === "POST" ? { policy: p } : { policies: [p] },
      });
    }
    if (path.endsWith("/duplicates"))
      return route.fulfill({ json: { dates: blocked } });
    if (path.endsWith("/preview")) {
      const input = q.postDataJSON();
      return route.fulfill({
        json: {
          preview: {
            fingerprint: "synthetic-fingerprint",
            approvedDays: input.approvedEventIds.length,
            creditYear: year,
            previouslyApproved: 0,
            accountsBefore: [{ bucket: "JOINT_LEAVE_CLAIM", availableDays: 0 }],
          },
        },
      });
    }
    if (path.endsWith("/review")) {
      const input = q.postDataJSON();
      reviews.push(input);
      if (reviewConflict && reviews.length === 1)
        return route.fulfill({
          status: 409,
          json: { error: "Pratinjau berubah, periksa ulang" },
        });
      c = {
        ...c,
        status: input.approvedEventIds.length ? "APPROVED" : "REJECTED",
        reason: input.reason,
        reviewedAt: new Date().toISOString(),
        dates: c.dates.map((d) => ({
          ...d,
          status: input.approvedEventIds.includes(d.eventId)
            ? "APPROVED"
            : "REJECTED",
        })),
      };
      return route.fulfill({ json: { claim: c } });
    }
    if (path.endsWith("/evidence"))
      return route.fulfill({ contentType: "application/pdf", body: bytes });
    if (path.endsWith("/" + id(4)))
      return route.fulfill({ json: { claim: c } });
    if (q.method() === "POST") {
      const form = await new Response(q.postDataBuffer(), {
        headers: { "content-type": q.headers()["content-type"] },
      }).formData();
      submits.push(JSON.parse(form.get("data")));
      if (failSubmit && submits.length === 1)
        return route.fulfill({
          status: 409,
          json: { error: "Gangguan uji, coba ulang" },
        });
      return route.fulfill({ json: { claim: { ...c, id: id(5) } } });
    }
    return route.fulfill({ json: { claims: [c], total: 1 } });
  });
  await page.goto(base + (shell ? "?shell=1" : admin ? "?admin=1" : ""));
  await page.getByRole("button", { name: "Lihat Detail" }).waitFor();
  return {
    page,
    errors,
    submits,
    reviews,
    configurations,
    close: async () => {
      assert.deepEqual(errors, []);
      await page.close();
      passed++;
    },
  };
}
try {
  {
    const f = await fixture({ blocked: [p.eventDates[0].date] });
    await f.page
      .getByRole("button", { name: "Ajukan Klaim", exact: true })
      .click();
    const d = f.page.getByRole("dialog");
    await d
      .getByText("Sudah ada klaim yang diperiksa/disetujui untuk tanggal ini.")
      .waitFor();
    assert.equal(await d.getByRole("checkbox").first().isDisabled(), true);
    await d.getByRole("checkbox").nth(1).check();
    await d.getByLabel("Judul penugasan").fill("Siaga uji baru");
    await d.locator('input[type="file"]').setInputFiles({
      name: "bukti.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await d.getByRole("button", { name: "Ajukan Klaim", exact: true }).click();
    await f.page
      .getByText("Klaim berhasil diajukan. Tunggu pemeriksaan Admin.")
      .waitFor();
    assert.deepEqual(f.submits[0].eventIds, [id(3)]);
    assert.equal(f.submits[0].sprinNumber, null);
    await f.close();
  }
  {
    const f = await fixture({ admin: true });
    await f.page.getByRole("button", { name: "Lihat Detail" }).click();
    const d = f.page.getByRole("dialog");
    await d.getByRole("heading", { name: "Pemeriksaan Admin" }).waitFor();
    for (const cb of await d.getByRole("checkbox", { name: /Setujui/ }).all())
      await cb.uncheck();
    await d
      .getByLabel("Alasan/catatan pemeriksaan")
      .fill("Bukti perlu diperbaiki");
    await d.getByRole("button", { name: "Pratinjau Keputusan" }).click();
    await d.getByRole("button", { name: "Simpan Keputusan" }).waitFor();
    assert.equal(
      await d.getByRole("button", { name: "Simpan Keputusan" }).isDisabled(),
      true,
    );
    await d
      .getByLabel("Alasan/catatan pemeriksaan")
      .fill("Bukti tidak cocok dengan tanggal tugas");
    assert.equal(
      await d.getByRole("button", { name: "Simpan Keputusan" }).count(),
      0,
    );
    await d.getByRole("button", { name: "Pratinjau Keputusan" }).click();
    await d.getByLabel("Saya mengonfirmasi hasil pemeriksaan di atas.").check();
    await d.getByRole("button", { name: "Simpan Keputusan" }).click();
    await d.getByRole("heading", { name: "Alasan Penolakan" }).waitFor();
    assert.deepEqual(f.reviews[0].approvedEventIds, []);
    assert.equal(f.reviews[0].reason, "Bukti tidak cocok dengan tanggal tugas");
    await f.close();
  }
  {
    const f = await fixture({ status: "REJECTED", failSubmit: true });
    await f.page.getByRole("button", { name: "Lihat Detail" }).click();
    await f.page
      .getByRole("button", { name: "Ajukan Ulang dengan Perbaikan" })
      .click();
    const d = f.page.getByRole("dialog");
    assert.equal(
      await d.getByLabel("Judul penugasan").inputValue(),
      "Penugasan Uji",
    );
    assert.equal(
      await d
        .getByRole("button", { name: "Ajukan Klaim", exact: true })
        .isDisabled(),
      true,
    );
    await d.locator('input[type="file"]').setInputFiles({
      name: "bukti-baru.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await d.getByRole("button", { name: "Ajukan Klaim", exact: true }).click();
    await d.getByRole("alert").waitFor();
    await d.getByRole("button", { name: "Ajukan Klaim", exact: true }).click();
    await f.page
      .getByText("Klaim berhasil diajukan. Tunggu pemeriksaan Admin.")
      .waitFor();
    assert.equal(f.submits[0].idempotencyKey, f.submits[1].idempotencyKey);
    await f.close();
  }
  {
    const f = await fixture({ admin: true, mobile: true });
    await f.page
      .getByRole("button", { name: "Atur Tanggal Cuti Bersama" })
      .click();
    const d = f.page.getByRole("dialog");
    await d
      .getByLabel("Nama pengaturan/versi")
      .fill("Natal/Tahun Baru Sintetis");
    await d
      .getByLabel("Batas hari kumulatif per pegawai pada tahun saldo")
      .fill("1");
    await d.getByLabel("Referensi keputusan resmi").fill("DASAR UJI");
    await d
      .getByLabel("Tanggal cuti bersama", { exact: true })
      .fill(`${year - 1}-12-26`);
    await d.getByLabel("Nama/keterangan").fill("Natal Uji");
    await d.getByLabel("Kelompok").selectOption("YEAR_END");
    await d.screenshot({ path: "/tmp/si-cuti-joint-policy-mobile.png" });
    const box = await d.boundingBox();
    assert.ok(box.width <= 390);
    await d.getByRole("button", { name: "Simpan Pengaturan" }).click();
    await f.page
      .getByText("Pengaturan tanggal berhasil disimpan sebagai versi baru.")
      .waitFor();
    assert.equal(f.configurations[0].creditYear, year);
    assert.equal(f.configurations[0].events[0].kind, "YEAR_END");
    await f.page.getByRole("button", { name: "Lihat Detail" }).click();
    await f.page.keyboard.press("Escape");
    assert.equal(await f.page.getByRole("dialog").count(), 0);
    assert.equal(
      await f.page
        .getByRole("button", { name: "Lihat Detail" })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await f.close();
  }
  {
    const f = await fixture({
      status: "REJECTED",
      blocked: [p.eventDates[0].date],
    });
    await f.page.getByRole("button", { name: "Lihat Detail" }).click();
    await f.page
      .getByRole("button", { name: "Ajukan Ulang dengan Perbaikan" })
      .click();
    const d = f.page.getByRole("dialog");
    await d
      .getByText("Sudah ada klaim yang diperiksa/disetujui untuk tanggal ini.")
      .waitFor();
    assert.equal(await d.getByRole("checkbox").first().isDisabled(), true);
    assert.equal(await d.getByRole("checkbox").nth(1).isChecked(), true);
    await d.locator('input[type="file"]').setInputFiles({
      name: "bukti.pdf",
      mimeType: "application/pdf",
      buffer: bytes,
    });
    await d.getByRole("button", { name: "Ajukan Klaim", exact: true }).click();
    await f.page
      .getByText("Klaim berhasil diajukan. Tunggu pemeriksaan Admin.")
      .waitFor();
    assert.deepEqual(f.submits[0].eventIds, [id(3)]);
    await f.close();
  }
  {
    const f = await fixture({ admin: true, reviewConflict: true });
    await f.page.getByRole("button", { name: "Lihat Detail" }).click();
    const d = f.page.getByRole("dialog");
    await d.getByLabel("Alasan/catatan pemeriksaan").fill("Bukti sesuai");
    await d.getByRole("checkbox", { name: /Saya telah memeriksa/ }).check();
    await d.getByRole("button", { name: "Pratinjau Keputusan" }).click();
    await d.getByLabel("Saya mengonfirmasi hasil pemeriksaan di atas.").check();
    await d.getByRole("button", { name: "Simpan Keputusan" }).click();
    await d.getByRole("alert").waitFor();
    assert.equal(
      await d.getByRole("button", { name: "Simpan Keputusan" }).count(),
      0,
    );
    await d.getByRole("button", { name: "Pratinjau Keputusan" }).click();
    assert.equal(
      await d
        .getByLabel("Saya mengonfirmasi hasil pemeriksaan di atas.")
        .isChecked(),
      false,
    );
    await f.close();
  }
  {
    const f = await fixture({ shell: true });
    const nav = f.page.getByRole("navigation", { name: "Navigasi utama" });
    assert.equal(
      await nav.getByRole("link", { name: "Profil Saya" }).getAttribute("href"),
      "/#profil",
    );
    assert.equal(
      await nav
        .getByRole("link", { name: "Pengajuan", exact: true })
        .getAttribute("href"),
      "/pengajuan",
    );
    assert.equal(
      await nav
        .getByRole("link", { name: "Klaim Cuti Bersama" })
        .getAttribute("aria-current"),
      "page",
    );
    await f.close();
  }
  console.log(
    `Joint Leave browser scenarios: ${passed} passed (synthetic intercepted APIs, not database E2E).`,
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
