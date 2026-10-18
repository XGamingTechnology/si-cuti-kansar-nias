/** Documentation-only harness. No mocks, cookie injection, DOM edits or runtime changes.
 * Requires a FRESH disposable local DB, migrated schema, running app and explicit ack.
 * Bootstrap uses existing Employee/Account services; PermissionType is a labelled reference fixture.
 * Never run against shared/staging/production. Password exists only in process memory.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright"),
  { build } = require("esbuild"),
  { PDFDocument, StandardFonts } = require("pdf-lib"),
  sharp = require("sharp");
const url = new URL(process.env.DATABASE_URL || ""),
  base = process.env.GUIDES_BASE_URL || "http://127.0.0.1:3199";
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.ok(url.pathname.startsWith("/user_guides_"));
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const root = resolve("docs/user-guides"),
  sourceSha = execFileSync("git", ["rev-parse", "origin/staging"], {
    encoding: "utf8",
  }).trim(),
  manifest = [],
  issues = [],
  checks = [];
const resume = process.env.GUIDES_RESUME === "1";
if (resume) {
  const prior = JSON.parse(
    await readFile(`${root}/screenshot-manifest.json`, "utf8"),
  );
  assert.equal(prior.sourceSha, sourceSha);
  manifest.push(...prior.screenshots);
  issues.push(...prior.conditionsNotCaptured);
  checks.push(...prior.checks);
}
await mkdir(`${root}/screenshots/originals`, { recursive: true });
await mkdir(".next", { recursive: true });
const password = randomBytes(24).toString("base64url");
await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "ts",
    contents: `
import {createDatabaseClient} from './src/infrastructure/database/client';
import {EmployeeService} from './src/application/employees/service';
import {PrismaEmployeeRepository} from './src/infrastructure/employees/prisma-employee-repository';
import {AccountAdministrationService} from './src/application/accounts/service';
import {PrismaAccountAdministrationRepository} from './src/infrastructure/accounts/prisma-account-administration-repository';
import {createJointLeaveRuntime} from './src/infrastructure/joint-leave/runtime';
import {randomUUID} from 'node:crypto';
export default async function(password:string,resume:boolean) { const db=createDatabaseClient();
 try { if(await db.employee.count()) {
 if(!resume) throw new Error('Fresh empty disposable DB required');
 const e=await db.employee.findUniqueOrThrow({where:{nip:'DOC-ADMIN'}});const admin=await db.user.findUniqueOrThrow({where:{employeeId:e.id}});const accounts=new AccountAdministrationService(new PrismaAccountAdministrationRepository(db));
 for(const employee of await db.employee.findMany({where:{user:{isNot:null}}})) await accounts.resetPassword(employee.id,password,new Date(),{actorUserId:admin.id});
 return {admin:e,type:await db.permissionType.findUniqueOrThrow({where:{code:'DOC_ONLY'}}),policy:await db.jointLeavePolicy.findFirst({include:{eventDates:true}})};
 }
 const e=await new EmployeeService(new PrismaEmployeeRepository(db)).create({nip:'DOC-ADMIN',fullName:'Admin Dokumentasi',positionTitle:'Admin Contoh',workUnit:'Unit Dokumentasi',employmentStartDate:'2020-01-01'});
 await new AccountAdministrationService(new PrismaAccountAdministrationRepository(db)).provision(e.id,{role:'ADMIN_KEPEGAWAIAN',password});
 const type=await db.permissionType.create({data:{code:'DOC_ONLY',name:'Izin Contoh Dokumentasi',description:'Fixture lokal; bukan jenis/kebijakan resmi'}});
 const jr=createJointLeaveRuntime();const policyInput={name:'SIMULASI DOKUMENTASI - bukan kebijakan resmi',creditYear:2026,quotaDays:2,sourceReference:'FIXTURE LOKAL, bukan SKB/kuota pemerintah',events:[{date:'2026-10-12',name:'Tanggal contoh penugasan A (simulasi)',kind:'REGULAR'},{date:'2026-10-13',name:'Tanggal contoh penugasan B (simulasi)',kind:'REGULAR'}]};const policyKey=randomUUID();let policy;try{policy=await jr.jointLeave.configure({userId:(await db.user.findUniqueOrThrow({where:{employeeId:e.id}})).id,employeeId:e.id,fullName:e.fullName,role:'ADMIN_KEPEGAWAIAN'},policyInput,policyKey);}finally{await jr.database.$disconnect();}
 return {admin:e,type,policy,policyKey,policyInput}; } finally {await db.$disconnect();}}
`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: ".next/guides-bootstrap.mjs",
  logLevel: "error",
});
const fixture = await (
  await import(pathToFileURL(resolve(".next/guides-bootstrap.mjs")))
).default(password, resume);
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
async function context() {
  const ctx = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Jakarta",
    acceptDownloads: true,
  });
  ctx.setDefaultTimeout(8000);
  return ctx;
}
async function shot(page, role, slug, chapter, scenario, target) {
  await page.waitForLoadState("networkidle");
  if (target) await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const previous = resume
    ? manifest.find((x) => x.file.endsWith(`-${role}-${slug}.png`))
    : null;
  const file = previous
    ? previous.file.split("/").at(-1)
    : `${String(manifest.length + 1).padStart(3, "0")}-${role}-${slug}.png`;
  if (previous) manifest.splice(manifest.indexOf(previous), 1);
  await page.screenshot({
    path: `${root}/screenshots/originals/${file}`,
    fullPage: false,
    animations: "disabled",
  });
  manifest.push({
    file: `screenshots/originals/${file}`,
    role,
    route:
      new URL(page.url()).pathname +
      new URL(page.url()).search +
      new URL(page.url()).hash,
    scenario,
    sourceSha,
    viewport: page.viewportSize(),
    dataMode: "REAL_DB",
    chapter,
    origin: "BROWSER_UI",
    notes:
      "Data sintetis lokal; login normal, tanpa intersepsi atau injeksi sesi.",
  });
  console.log(`CAPTURE ${file}`);
  return file;
}
async function optional(label, fn) {
  if (
    process.env.GUIDES_ONLY &&
    !new RegExp(process.env.GUIDES_ONLY).test(label)
  )
    return;
  try {
    await fn();
    checks.push({ scenario: label, status: "PASS" });
    for (let i = issues.length - 1; i >= 0; i--)
      if (issues[i].scenario === label) issues.splice(i, 1);
  } catch (e) {
    issues.push({
      scenario: label,
      reason: String(e.message).split("Call log:")[0],
    });
    console.log(`BLOCKED ${label}: ${String(e.message).split("Call log:")[0]}`);
  }
}
async function api(ctx, path, data, method = "POST", headers = {}) {
  const r = await ctx.request.fetch(path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(data === undefined ? {} : { data }),
  });
  const result = await r.json().catch(() => null);
  if (!r.ok())
    throw new Error(
      `${method} ${path.split("?")[0]} HTTP ${r.status()}: ${result?.error || "Respons tidak valid"}`,
    );
  return result;
}
async function login(ctx, nip) {
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("NIP", { exact: true }).fill(nip);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(nip === "DOC-ADMIN" ? "**/" : "**/dashboard");
  await page.locator(".authenticated-topbar").waitFor();
  return page;
}
async function leave(ctx, reason, date = "2026-10-26", end = date) {
  return (
    await api(ctx, "/api/workflow/leave", {
      leaveType: "ANNUAL",
      startDate: date,
      endDate: end,
      reason,
      formPlace: "Kota Contoh",
      leaveAddress: "Alamat sintetis untuk dokumentasi",
      leavePhone: "000000000000",
    })
  ).request;
}
async function action(ctx, id, act, extra = {}) {
  return api(ctx, `/api/workflow/leave/${id}/actions`, {
    action: act,
    idempotencyKey: randomUUID(),
    reason: "Catatan contoh dokumentasi",
    evidenceReference: "DASAR-CONTOH-LOKAL",
    ...extra,
  });
}
async function signed(ctx, id, bytes, name = "scan-contoh.pdf") {
  const r = await ctx.request.post(`/api/workflow/leave/${id}/documents`, {
    multipart: { file: { name, mimeType: "application/pdf", buffer: bytes } },
  });
  const d = await r.json();
  assert.ok(r.ok(), d.error);
  return d.document;
}
async function detail(page, id, kind = "leave") {
  await page.goto(`/pengajuan?kind=${kind}`);
  await page.locator(".request-card").first().waitFor();
  const card = page
    .locator(`.request-card`)
    .filter({ has: page.locator(`[data-never]`) });
  void card; // Selection is performed through visible text by caller.
  const rows = await api(employee, "/api/workflow/" + kind, undefined, "GET");
  const index = rows.requests.findIndex((r) => r.id === id);
  assert.ok(index >= 0);
  await page.locator(".request-card").nth(index).click();
  await page.getByRole("dialog").first().waitFor();
  return page.getByRole("dialog").first();
}
let admin, employee, ap, ep;
try {
  if (!resume) {
    const guest = await context(),
      gp = await guest.newPage();
    await gp.goto("/");
    await shot(gp, "umum", "login", "U1", "Form login kosong");
    await gp.getByLabel("NIP", { exact: true }).fill("DOC-TIDAK-ADA");
    await gp
      .getByLabel("Kata sandi", { exact: true })
      .fill("uji-sintetis-tidak-valid");
    await gp.getByRole("button", { name: "Masuk", exact: true }).click();
    await gp.getByLabel("Notifikasi masuk", { exact: true }).waitFor();
    await gp.getByLabel("Kata sandi", { exact: true }).fill("");
    await shot(
      gp,
      "umum",
      "login-gagal",
      "U1",
      "Penolakan login; password dikosongkan sebelum screenshot",
    );
    await guest.close();
  }

  admin = await context();
  ap = await login(admin, "DOC-ADMIN");
  checks.push({ scenario: "Login Admin melalui UI", status: "PASS" });
  let a, b, approved, pending, corrected, rejected, cancelled, draft, perm;
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage();
  pg.drawText("CONTOH DOKUMENTASI - BUKAN DOKUMEN RESMI", {
    x: 30,
    y: 780,
    size: 14,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  });
  pg.drawText(
    "Scan tanda tangan/bukti sintetis. Tidak ada tanda tangan asli.",
    { x: 30, y: 750, size: 11 },
  );
  const bytes = Buffer.from(await pdf.save());
  if (resume) {
    const employees = (
      await api(admin, "/api/admin/employees", undefined, "GET")
    ).employees;
    a = employees.find((e) => e.nip === "000000000000000001");
    b = employees.find((e) => e.nip === "000000000000000002");
    employee = await context();
    ep = await login(employee, a.nip);
    const list = (await api(employee, "/api/workflow/leave", undefined, "GET"))
      .requests;
    const find = (reason) =>
      list.find((r) => r.currentRevision.reason === reason);
    approved = find("Contoh cuti disetujui dan pengembalian");
    pending = find("Contoh cuti menunggu tinjauan");
    corrected = find("Contoh cuti perlu diperbaiki");
    rejected = find("Contoh cuti ditolak");
    cancelled = find("Contoh cuti dibatalkan");
    draft = find("Contoh draf tersimpan");
    perm = (await api(employee, "/api/workflow/permission", undefined, "GET"))
      .requests[0];
  } else {
    a = (
      await api(admin, "/api/admin/employees", {
        nip: "000000000000000001",
        fullName: "Pegawai Contoh A",
        positionTitle: "Pelaksana Contoh",
        workUnit: "Unit Dokumentasi",
        directSupervisorId: fixture.admin.id,
        employmentStartDate: "2020-01-01",
      })
    ).employee;
    b = (
      await api(admin, "/api/admin/employees", {
        nip: "000000000000000002",
        fullName: "Pegawai Contoh B",
        positionTitle: "Pelaksana Contoh",
        workUnit: "Unit Contoh",
        directSupervisorId: fixture.admin.id,
        employmentStartDate: "2020-01-01",
      })
    ).employee;
    for (const e of [a, b]) {
      await api(admin, `/api/admin/employees/${e.id}/account`, {
        role: "PEGAWAI",
        password,
      });
      await api(admin, `/api/admin/annual-balances/${e.id}/initialize`, {
        entitlementYear: 2026,
        n1Days: 0,
        n2Days: 0,
        reason: "Saldo fixture dokumentasi; bukan data pegawai nyata",
        idempotencyKey: randomUUID(),
      });
    }
    await api(admin, "/api/admin/leave-authorized-officials", {
      fullName: "Pejabat Contoh Dokumentasi",
      nip: "DOC-PEJABAT",
      capacity: "DEFINITIVE",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      sourceReference: "SIMULASI LOKAL, bukan SK resmi",
      notes: "Fixture dokumentasi",
    });
    employee = await context();
    ep = await login(employee, a.nip);
    checks.push({ scenario: "Login Pegawai melalui UI", status: "PASS" });

    approved = await leave(
      employee,
      "Contoh cuti disetujui dan pengembalian",
      "2026-10-16",
      "2026-10-19",
    );
    await action(employee, approved.id, "SUBMIT");
    const scan = await signed(employee, approved.id, bytes);
    await signed(employee, approved.id, bytes, "scan-contoh-v2.pdf");
    await action(admin, approved.id, "APPROVE", {
      documentId: scan.id,
      reason: "Persetujuan contoh lokal",
    });
    const evidenceResponse = await admin.request.post(
      `/api/workflow/leave/${approved.id}/returns/evidence`,
      {
        multipart: {
          file: {
            name: "dasar-pengembalian-contoh.pdf",
            mimeType: "application/pdf",
            buffer: bytes,
          },
        },
      },
    );
    const evidence = (await evidenceResponse.json()).document;
    assert.ok(evidenceResponse.ok());
    const ret = {
      restoredDays: 1,
      reason:
        "Contoh hari tidak digunakan; tanggal penggunaan aktual tidak ditentukan",
      basisReference: "DASAR-CONTOH-01",
      basisDate: "2026-10-18",
      evidenceDocumentId: evidence.id,
      unusedDaysConfirmed: true,
    };
    const rp = (
      await api(
        admin,
        `/api/workflow/leave/${approved.id}/returns/preview`,
        ret,
      )
    ).preview;
    await api(admin, `/api/workflow/leave/${approved.id}/returns`, {
      ...ret,
      fingerprint: rp.fingerprint,
      idempotencyKey: randomUUID(),
    });
    pending = await leave(
      employee,
      "Contoh cuti menunggu tinjauan",
      "2026-10-22",
    );
    await action(employee, pending.id, "SUBMIT");
    await signed(employee, pending.id, bytes);
    corrected = await leave(
      employee,
      "Contoh cuti perlu diperbaiki",
      "2026-10-23",
    );
    await action(employee, corrected.id, "SUBMIT");
    await action(admin, corrected.id, "RETURN", {
      reason: "Lengkapi alamat contoh dan unggah scan terbaru setelah revisi",
    });
    rejected = await leave(employee, "Contoh cuti ditolak", "2026-10-27");
    await action(employee, rejected.id, "SUBMIT");
    await action(admin, rejected.id, "REJECT", {
      reason: "Contoh dasar permohonan belum memenuhi pemeriksaan",
    });
    cancelled = await leave(employee, "Contoh cuti dibatalkan", "2026-10-28");
    await action(employee, cancelled.id, "SUBMIT");
    await action(employee, cancelled.id, "CANCEL");
    draft = await leave(employee, "Contoh draf tersimpan", "2026-10-29");
    perm = (
      await api(employee, "/api/workflow/permission", {
        permissionTypeId: fixture.type.id,
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        reason: "Contoh izin, jenis fixture bukan kebijakan instansi",
      })
    ).request;
    await api(employee, `/api/workflow/permission/${perm.id}/actions`, {
      action: "SUBMIT",
      idempotencyKey: randomUUID(),
    });
  }
  if (!resume) {
    await shot(
      ep,
      "pegawai",
      "beranda",
      "P1",
      "Saldo sendiri, ringkasan tindakan dan aksi utama",
    );
    await shot(
      ep,
      "pegawai",
      "kalender",
      "P1",
      "Kalender personal, legenda, hari ini dan agenda",
      ep
        .getByRole("region", { name: /Kalender / })
        .first()
        .or(ep.getByLabel("Legenda kalender"))
        .first(),
    ).catch(async () =>
      shot(
        ep,
        "pegawai",
        "kalender",
        "P1",
        "Kalender personal",
        ep.getByLabel("Legenda kalender"),
      ),
    );
    await ep.getByLabel("Legenda kalender").scrollIntoViewIfNeeded();
    await shot(
      ep,
      "pegawai",
      "agenda",
      "P1",
      "Agenda sendiri dan penanda pengembalian",
      ep.getByRole("region", { name: "Agenda pengajuan", exact: true }),
    );
    for (const [obj, slug, chap] of [
      [draft, "draf", "P2"],
      [pending, "diajukan", "P2"],
      [corrected, "perbaikan", "P3"],
      [rejected, "ditolak", "P3"],
      [cancelled, "dibatalkan", "P3"],
      [approved, "disetujui", "P4"],
    ])
      await optional(`Pegawai ${slug}`, async () => {
        const d = await detail(ep, obj.id);
        await shot(ep, "pegawai", slug, chap, `Detail ${slug}`, d);
        if (obj.id === approved.id) {
          await shot(
            ep,
            "pegawai",
            "arsip-dan-return",
            "P4",
            "Arsip keputusan dan pengembalian",
            ep.getByRole("heading", { name: "Pengembalian Cuti", exact: true }),
          );
        }
        if (obj.id === pending.id) {
          await shot(
            ep,
            "pegawai",
            "scan-versi",
            "P4",
            "Formulir awal dan daftar versi scan",
            ep.getByRole("heading", {
              name: "Scan Bertanda Tangan",
              exact: true,
            }),
          );
        }
      });
    await optional("Form cuti baru", async () => {
      await ep.goto("/pengajuan?kind=leave&new=1");
      await shot(
        ep,
        "pegawai",
        "form-cuti",
        "P2",
        "Form pengajuan baru sebelum disimpan",
        ep.getByRole("heading", { name: "Ajukan cuti", exact: true }),
      );
      await shot(
        ep,
        "pegawai",
        "form-cuti-bawah",
        "P2",
        "Tanggal, alasan dan Simpan Draf pada bagian bawah form",
        ep.getByRole("button", { name: "Simpan Draf", exact: true }),
      );
    });
    await optional("Form izin", async () => {
      await ep.goto("/pengajuan?kind=permission&new=1");
      await shot(
        ep,
        "pegawai",
        "form-izin",
        "P5",
        "Jenis izin fixture aktif; bukan daftar resmi",
        ep.getByRole("heading", { name: "Ajukan izin", exact: true }),
      );
    });
  }
  await optional("Bagian bawah form cuti", async () => {
    await ep.goto("/pengajuan?kind=leave&new=1");
    await shot(
      ep,
      "pegawai",
      "form-cuti-bawah",
      "P2",
      "Tanggal, alasan dan Simpan Draf pada bagian bawah form",
      ep.getByRole("button", { name: "Simpan Draf", exact: true }),
    );
  });
  // Local policies/events explicitly labelled synthetic. These are NOT government calendars or quotas.
  if (!resume)
    await optional("HTTP konfigurasi klaim", async () => {
      await api(
        admin,
        "/api/joint-leave/policies",
        fixture.policyInput,
        "POST",
        { "idempotency-key": fixture.policyKey },
      );
    });
  await optional("Klaim endpoint koleksi", async () => {
    const r = await employee.request.get("/api/joint-leave?year=2026");
    assert.equal(r.status(), 200, "GET koleksi klaim HTTP " + r.status());
  });
  await optional("Pegawai klaim (kondisi aktual)", async () => {
    await ep.goto("/klaim-cuti-bersama");
    await shot(
      ep,
      "pegawai",
      "klaim-kendala",
      "P6",
      "Kondisi aktual: endpoint koleksi gagal, bukan daftar kosong yang sah",
    );
    await ep.getByRole("button", { name: "Ajukan Klaim", exact: true }).click();
    await shot(
      ep,
      "pegawai",
      "klaim-form-kendala",
      "P6",
      "Form klaim dan kendala memuat kebijakan",
      ep.getByRole("dialog"),
    );
    await ep.keyboard.press("Escape");
  });
  await optional("Perbaikan dan submit ulang", async () => {
    let d = await detail(ep, corrected.id);
    await d
      .getByRole("button", { name: "Perbaiki Pengajuan", exact: true })
      .click();
    await shot(
      ep,
      "pegawai",
      "form-perbaikan",
      "P3",
      "Edit revisi dikembalikan sebelum diajukan kembali",
    );
    const current = (
      await api(
        employee,
        `/api/workflow/leave/${corrected.id}`,
        undefined,
        "GET",
      )
    ).request.currentRevision;
    await api(
      employee,
      `/api/workflow/leave/${corrected.id}`,
      {
        leaveType: current.leaveType,
        startDate: current.startDate,
        endDate: current.endDate,
        reason: "Contoh cuti telah diperbaiki",
        formPlace: "Kota Contoh",
        leaveAddress: "Alamat contoh diperbarui",
        leavePhone: "000000000000",
      },
      "PATCH",
    );
    await action(employee, corrected.id, "SUBMIT");
    d = await detail(ep, corrected.id);
    await shot(
      ep,
      "pegawai",
      "revisi-diajukan-kembali",
      "P3",
      "Revisi berikutnya dan status diajukan kembali",
      ep.getByRole("heading", { name: "Riwayat Revisi", exact: true }),
    );
  });
  await optional("PDF aktual", async () => {
    for (const [path, name] of [
      [`/api/workflow/leave/${approved.id}/document`, "formulir-awal"],
      [
        `/api/workflow/leave/${approved.id}/decision/document`,
        "keputusan-final",
      ],
    ]) {
      const r = await employee.request.get(path);
      assert.ok(r.ok());
      const content = await r.body();
      await PDFDocument.load(content);
      await writeFile(`/tmp/guides-${name}.pdf`, content);
      execFileSync("pdftoppm", [
        "-f",
        "1",
        "-singlefile",
        "-scale-to",
        "1100",
        "-png",
        `/tmp/guides-${name}.pdf`,
        `/tmp/guides-${name}`,
      ]);
      const file = `${String(manifest.length + 1).padStart(3, "0")}-pegawai-pdf-${name}.png`;
      await writeFile(
        `${root}/screenshots/originals/${file}`,
        await readFile(`/tmp/guides-${name}.png`),
      );
      manifest.push({
        file: `screenshots/originals/${file}`,
        role: "pegawai",
        route: path,
        scenario: `Render halaman pertama PDF ${name} asli keluaran aplikasi; data sintetis`,
        sourceSha,
        viewport: null,
        dataMode: "REAL_DB",
        origin: "APPLICATION_PDF_RENDER",
        chapter: "P4",
        notes:
          "PDF diambil melalui sesi login; bukan screenshot menu dan bukan dokumen resmi.",
      });
    }
  });
  for (const role of ["pegawai", "admin"])
    await optional(`Profil ${role}`, async () => {
      const p = role === "pegawai" ? ep : ap;
      const ctx = role === "pegawai" ? employee : admin;
      const meta = await api(ctx, "/api/me/avatar", undefined, "GET");
      if (meta.hasPhoto)
        await api(ctx, "/api/me/avatar", undefined, "DELETE", {
          "if-match": `"${meta.version}"`,
          "idempotency-key": randomUUID(),
        });
      await p.goto("/profil");
      await shot(
        p,
        role,
        "profil-inisial",
        role === "pegawai" ? "P7" : "A9",
        "Profil sendiri dengan fallback inisial",
      );
      const image = await sharp({
        create: { width: 600, height: 400, channels: 3, background: "#387393" },
      })
        .png()
        .toBuffer();
      await p.locator('input[type="file"]').setInputFiles({
        name: "foto-contoh-bidang-warna.png",
        mimeType: "image/png",
        buffer: image,
      });
      await shot(
        p,
        role,
        "foto-preview",
        role === "pegawai" ? "P7" : "A9",
        "Preview foto sintetis lokal belum disimpan",
      );
      await p.getByRole("button", { name: "Simpan foto", exact: true }).click();
      await p.getByText(/Foto profil tersimpan/).waitFor();
      await p.waitForFunction(() => {
        const images = [...document.querySelectorAll(".account-avatar img")];
        return (
          images.length > 0 &&
          images.every((i) => i.complete && i.naturalWidth > 0)
        );
      });
      await shot(
        p,
        role,
        "foto-tersimpan",
        role === "pegawai" ? "P7" : "A9",
        "Foto diri sendiri tersimpan, header/sidebar diperbarui",
      );
      await p.getByRole("button", { name: "Hapus foto", exact: true }).click();
      await shot(
        p,
        role,
        "hapus-foto",
        role === "pegawai" ? "P7" : "A9",
        "Konfirmasi hapus foto sendiri",
      );
      await p
        .getByRole("button", { name: "Ya, hapus foto", exact: true })
        .click();
      await p.getByText(/Foto profil dihapus/).waitFor();
      await shot(
        p,
        role,
        "foto-dihapus",
        role === "pegawai" ? "P7" : "A9",
        "Foto dihapus; inisial dipakai kembali",
      );
    });
  // Employee master / local pagination: all created through Admin API, not raw SQL.
  const existingEmployees = (
    await api(admin, "/api/admin/employees", undefined, "GET")
  ).employees;
  for (let i = 3; i <= 12; i++)
    if (
      !existingEmployees.some(
        (e) => e.nip === `DOC-CONTOH-${String(i).padStart(2, "0")}`,
      )
    )
      await api(admin, "/api/admin/employees", {
        nip: `DOC-CONTOH-${String(i).padStart(2, "0")}`,
        fullName: `Pegawai Contoh ${String(i).padStart(2, "0")}`,
        positionTitle: "Jabatan Contoh",
        workUnit: "Unit Contoh",
        directSupervisorId: fixture.admin.id,
        employmentStartDate: "2020-01-01",
      });
  await ap.goto("/");
  if (!process.env.GUIDES_ONLY)
    await shot(
      ap,
      "admin",
      "pegawai-daftar",
      "A2",
      "Daftar aktif, search/unit dan pagination lokal",
    );
  await optional("Pegawai form detail edit arsip", async () => {
    await ap
      .getByRole("button", { name: "Tambah Pegawai", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "pegawai-tambah",
      "A2",
      "Tambah master tanpa saldo/akun",
      ap.getByRole("dialog"),
    );
    await ap.keyboard.press("Escape");
    await ap
      .getByLabel("Cari pegawai", { exact: true })
      .fill("Pegawai Contoh A");
    await ap
      .getByRole("button", {
        name: "Lihat detail Pegawai Contoh A",
        exact: true,
      })
      .filter({ visible: true })
      .click();
    await shot(
      ap,
      "admin",
      "pegawai-detail-akun",
      "A2",
      "Status pegawai dan akun terpisah",
      ap.getByRole("dialog"),
    );
    await shot(
      ap,
      "admin",
      "akun-reset",
      "A3",
      "Provision/role/reset LOCAL existing; password kosong",
      ap.getByRole("heading", { name: "Akses aplikasi", exact: true }),
    );
    await ap.getByRole("button", { name: "Edit Pegawai", exact: true }).click();
    await shot(
      ap,
      "admin",
      "pegawai-edit",
      "A2",
      "Edit master termasuk atasan langsung",
      ap.getByRole("dialog"),
    );
    await ap.keyboard.press("Escape");
    await ap
      .getByLabel("Cari pegawai", { exact: true })
      .fill("Pegawai Contoh B");
    await ap
      .getByRole("button", {
        name: "Lihat detail Pegawai Contoh B",
        exact: true,
      })
      .filter({ visible: true })
      .click();
    await ap
      .getByRole("button", { name: "Nonaktifkan Pegawai", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "pegawai-nonaktif-konfirmasi",
      "A2",
      "Konfirmasi dampak nonaktif dan sesi",
      ap.getByRole("dialog").last(),
    );
    await ap
      .getByRole("button", { name: "Ya, nonaktifkan", exact: true })
      .click();
    await ap.locator("dialog").waitFor({ state: "hidden" });
    await ap
      .getByLabel("Status pegawai", { exact: true })
      .selectOption("inactive");
    await shot(
      ap,
      "admin",
      "pegawai-arsip",
      "A2",
      "Arsip adalah filter pegawai nonaktif",
    );
    await ap
      .getByRole("button", {
        name: "Lihat detail Pegawai Contoh B",
        exact: true,
      })
      .filter({ visible: true })
      .click();
    await ap
      .getByRole("button", { name: "Aktifkan Pegawai", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "pegawai-reaktivasi",
      "A2",
      "Reaktivasi tidak mengaktifkan akun nonaktif otomatis",
      ap.getByRole("dialog").last(),
    );
    await ap
      .getByRole("button", { name: "Ya, aktifkan kembali", exact: true })
      .click();
  });
  await optional("Akun provision tanpa akun", async () => {
    await ap.goto("/");
    await ap
      .getByLabel("Cari pegawai", { exact: true })
      .fill("Pegawai Contoh 03");
    await ap
      .getByRole("button", {
        name: "Lihat detail Pegawai Contoh 03",
        exact: true,
      })
      .filter({ visible: true })
      .click();
    await shot(
      ap,
      "admin",
      "akun-provision",
      "A3",
      "Master tanpa akun: form Buat akun dengan kata sandi kosong",
      ap.getByRole("heading", { name: "Akses aplikasi", exact: true }),
    );
  });
  await optional("Import pegawai", async () => {
    await ap.goto("/");
    const download = ap.waitForEvent("download");
    await ap
      .getByRole("button", { name: "Unduh Template Pegawai", exact: true })
      .click();
    assert.equal((await download).suggestedFilename(), "template-pegawai.xlsx");
    const { templateWorkbook } =
      await import("../../../src/infrastructure/spreadsheet/workbook.ts");
    const headers = [
      "NIP",
      "Nama Lengkap",
      "Jabatan",
      "Unit Kerja",
      "Status Aktif",
    ];
    await ap
      .getByRole("button", { name: "Impor Pegawai", exact: true })
      .click();
    let d = ap.getByRole("dialog");
    await shot(
      ap,
      "admin",
      "impor-pegawai-form",
      "A3",
      "Impor pegawai terpisah dari saldo",
      d,
    );
    const upload = async (rows) =>
      d.getByLabel("Pilih workbook", { exact: true }).setInputFiles({
        name: "pegawai-contoh.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(templateWorkbook([headers, ...rows], "Pegawai")),
      });
    await upload([
      [a.nip, "Contoh duplikat", "Jabatan Contoh", "Unit Contoh", "AKTIF"],
    ]);
    await d
      .getByRole("button", { name: "Preview & Validasi", exact: true })
      .click();
    await d.getByText(/NIP: NIP sudah terdaftar/).waitFor();
    await shot(
      ap,
      "admin",
      "impor-pegawai-invalid",
      "A3",
      "Baris invalid dan diagnosis, belum tersimpan",
      d,
    );
    await upload([
      [
        "000000000000000099",
        "Pegawai Contoh Impor",
        "Jabatan Contoh",
        "Unit Contoh",
        "AKTIF",
      ],
    ]);
    await d
      .getByRole("button", { name: "Preview & Validasi", exact: true })
      .click();
    await d
      .getByText("Semua baris valid dan siap diimpor.", { exact: true })
      .waitFor();
    await shot(
      ap,
      "admin",
      "impor-pegawai-preview",
      "A3",
      "Preview valid sebelum konfirmasi",
      d,
    );
    await d
      .getByRole("button", { name: "Konfirmasi Impor Pegawai", exact: true })
      .click();
    await d.getByText(/Berhasil: 1/).waitFor();
    await shot(
      ap,
      "admin",
      "impor-pegawai-hasil",
      "A3",
      "Sukses transaksi, rincian dan unduh JSON",
      d,
    );
  });
  await optional("Saldo dan batch", async () => {
    await ap.goto("/admin/saldo-cuti");
    await shot(
      ap,
      "admin",
      "saldo-daftar",
      "A4",
      "Saldo siap/belum/partial dan tahun administrasi",
    );
    await ap
      .getByRole("button", { name: "Lihat detail", exact: true })
      .first()
      .click();
    await shot(
      ap,
      "admin",
      "saldo-detail",
      "A4",
      "Detail bucket dan inisialisasi satuan",
      ap.getByRole("dialog"),
    );
    await ap.keyboard.press("Escape");
    await ap.getByRole("button", { name: "Import Saldo", exact: true }).click();
    await shot(
      ap,
      "admin",
      "saldo-batch-form",
      "A4",
      "Template dan impor saldo berbeda dengan pegawai",
      ap.getByRole("dialog"),
    );
    const d = ap.getByRole("dialog");
    const { templateWorkbook } =
      await import("../../../src/infrastructure/spreadsheet/workbook.ts");
    const bytes = templateWorkbook([
      [
        "NIP",
        "Nama Pegawai",
        "Tahun",
        "N",
        "N-1",
        "N-2",
        "Cuti Bersama",
        "Dasar Administrasi",
      ],
      [
        "DOC-CONTOH-03",
        "Pegawai Contoh 03",
        2026,
        12,
        0,
        0,
        0,
        "SIMULASI DOKUMENTASI - dasar contoh",
      ],
    ]);
    await d.locator('input[type="file"]').setInputFiles({
      name: "saldo-contoh.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(bytes),
    });
    await d
      .getByRole("button", { name: "Preview dan Validasi", exact: true })
      .click();
    await d
      .getByRole("region", { name: "Hasil validasi per baris", exact: true })
      .waitFor();
    await shot(
      ap,
      "admin",
      "saldo-batch-preview",
      "A4",
      "Ready/skip/error sebelum commit, terpisah dari impor pegawai",
      d,
    );
    await d.locator('input[type="checkbox"]').check();
    await d
      .getByRole("button", {
        name: "Konfirmasi dan Inisialisasi Saldo",
        exact: true,
      })
      .click();
    await d.getByText(/Berhasil 1/).waitFor();
    await shot(
      ap,
      "admin",
      "saldo-batch-hasil",
      "A4",
      "Hasil per baris, tidak menimpa saldo existing",
      d,
    );
  });
  await optional("Pejabat cuti", async () => {
    await ap.goto("/admin/pejabat-cuti");
    await shot(
      ap,
      "admin",
      "pejabat-daftar",
      "A5",
      "Pejabat efektif dan batas perubahan historis",
    );
    await ap
      .getByRole("button", { name: "Tambah penugasan", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "pejabat-form",
      "A5",
      "Tanggal kapasitas dan referensi penugasan",
      ap.getByRole("dialog"),
    );
    await ap.keyboard.press("Escape");
    await ap
      .getByRole("button", { name: "Koreksi Darurat", exact: true })
      .first()
      .click();
    await shot(
      ap,
      "admin",
      "pejabat-koreksi-darurat",
      "A5",
      "Alasan, referensi dan konfirmasi; snapshot lama tidak berubah",
      ap.getByRole("dialog"),
    );
  });
  await optional("Admin dashboard kalender", async () => {
    await ap.goto("/dashboard");
    await shot(
      ap,
      "admin",
      "dashboard",
      "A1",
      "Ringkasan tetap, pending dan pegawai unik periode disetujui hari ini",
    );
    await shot(
      ap,
      "admin",
      "kalender-nama",
      "A1",
      "Chip nama dan kategori, weekend/legenda/agenda",
      ap.getByLabel("Legenda kalender"),
    );
    await shot(
      ap,
      "admin",
      "agenda",
      "A1",
      "Agenda dan periode persetujuan, bukan penggunaan aktual",
      ap.getByRole("region", { name: "Agenda pengajuan", exact: true }),
    );
  });
  await optional("Overlay preview (tanpa publikasi palsu)", async () => {
    await ap.goto("/dashboard");
    await ap
      .getByRole("button", { name: "Kelola kalender hari libur", exact: true })
      .click();
    const d = ap.getByRole("dialog");
    await shot(
      ap,
      "admin",
      "overlay-form",
      "A6",
      "Input/import dan riwayat kosong, belum ada dataset resmi",
      d,
    );
    const data = {
      year: 2026,
      sourceReference:
        "SIMULASI DOKUMENTASI - BELUM DIVERIFIKASI, JANGAN TERBITKAN",
      sourcePublishedOn: "2026-10-18",
      sourceUrl: "",
      events: [
        {
          date: "2026-10-20",
          name: "Contoh kategori LN - bukan tanggal resmi",
          category: "PUBLIC_HOLIDAY",
        },
        {
          date: "2026-10-21",
          name: "Contoh kategori CB - bukan tanggal resmi",
          category: "JOINT_LEAVE",
        },
      ],
    };
    await d
      .getByLabel("Impor JSON resmi tervalidasi", { exact: true })
      .setInputFiles({
        name: "simulasi-jangan-terbitkan.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
    await d
      .getByRole("button", { name: "Pratinjau overlay", exact: true })
      .click();
    await d
      .getByRole("heading", { name: "Pratinjau versi 1", exact: true })
      .waitFor();
    await shot(
      ap,
      "admin",
      "overlay-preview",
      "A6",
      "Pratinjau simulasi saja; checkbox verifikasi tidak dicentang",
      d.getByRole("region", { name: "Pratinjau overlay", exact: true }),
    );
    issues.push({
      scenario: "Overlay publikasi dan riwayat terisi",
      reason:
        "Tidak menerbitkan simulasi sebagai data resmi. PDF/nomor/perubahan SKB belum terverifikasi; source checkpoint calendar-data/2026/README.md.",
    });
  });
  await optional("Admin review cuti", async () => {
    const d = await detail(ap, pending.id);
    await shot(
      ap,
      "admin",
      "cuti-review-detail",
      "A7",
      "Detail request dengan scan dan aksi pemeriksaan",
      d,
    );
    await d.getByRole("button", { name: "Kembalikan", exact: true }).click();
    await shot(
      ap,
      "admin",
      "cuti-review-koreksi",
      "A7",
      "Dialog catatan pengembalian, bukan penolakan",
      ap.getByRole("dialog").last(),
    );
    await ap.keyboard.press("Escape");
    await d
      .getByRole("button", { name: "Setujui Pengajuan", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "cuti-review-persetujuan",
      "A7",
      "Memilih scan sumber dan dasar keputusan",
      ap.getByRole("dialog").last(),
    );
  });
  await optional("Admin final PDF dan return", async () => {
    await detail(ap, approved.id);
    await shot(
      ap,
      "admin",
      "arsip-final",
      "A7",
      "Arsip final, sumber dan edisi penanda",
      ap.getByRole("heading", { name: "Arsip Hasil Keputusan", exact: true }),
    );
    await ap
      .getByRole("button", { name: "Catat Pengembalian Cuti", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "return-form",
      "A7",
      "Bukti, dasar, jumlah dan attestation pengembalian",
      ap.getByRole("dialog").last(),
    );
  });
  await optional("Admin review izin", async () => {
    await ap.goto("/pengajuan?kind=permission");
    await ap.locator(".request-card").first().click();
    await shot(
      ap,
      "admin",
      "izin-review",
      "A7",
      "Review izin terpisah, tidak mengurangi saldo",
      ap.getByRole("dialog"),
    );
    await api(admin, `/api/workflow/permission/${perm.id}/actions`, {
      action: "APPROVE",
      reason: "Pemeriksaan contoh izin",
      evidenceReference: "BUKTI-IZIN-CONTOH",
      idempotencyKey: randomUUID(),
    });
  });
  await optional("Admin klaim aktual", async () => {
    await ap.goto("/klaim-cuti-bersama");
    await shot(
      ap,
      "admin",
      "klaim-kendala",
      "A6",
      "Respons aktual daftar klaim HTTP500",
    );
    await ap
      .getByRole("button", { name: "Atur Tanggal Cuti Bersama", exact: true })
      .click();
    await shot(
      ap,
      "admin",
      "klaim-kebijakan",
      "A6",
      "Form konfigurasi tersedia; simpan HTTP500 belum berhasil",
      ap.getByRole("dialog"),
    );
  });
  await optional("Laporan R1/R2 dan unduhan", async () => {
    await ap.goto("/admin/laporan");
    await shot(
      ap,
      "admin",
      "laporan-filter",
      "A8",
      "Filter ringkas laporan cuti dan izin terpisah",
    );
    for (const kind of ["Cuti", "Izin"]) {
      await ap.getByRole("button", { name: kind, exact: true }).click();
      await ap
        .getByRole("button", { name: /^Buat pratinjau( baru)?$/, exact: false })
        .click();
      await ap
        .getByRole("heading", {
          name: kind === "Cuti" ? "Rekap Pengajuan Cuti" : "Rekap Izin",
          exact: true,
        })
        .waitFor();
      await ap
        .getByText("Memproses laporan…", { exact: true })
        .waitFor({ state: "hidden" });
      await ap
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .waitFor();
      await shot(
        ap,
        "admin",
        `laporan-${kind.toLowerCase()}-preview`,
        "A8",
        `Snapshot pratinjau ${kind}, masa berlaku dan unit angka`,
        ap.getByRole("region", { name: "Pratinjau laporan", exact: true }),
      );
      for (const format of ["PDF", "Excel"]) {
        const dl = ap.waitForEvent("download");
        await ap
          .getByRole("button", { name: new RegExp(`Unduh ${format}`) })
          .click();
        const download = await dl;
        assert.ok(await download.path());
      }
      await shot(
        ap,
        "admin",
        `laporan-${kind.toLowerCase()}-unduhan`,
        "A8",
        `Handoff PDF/Excel berhasil dimulai; penyimpanan perangkat tidak diasumsikan`,
        ap.getByRole("region", { name: "Pratinjau laporan", exact: true }),
      );
    }
  });
  // Mobile captures are real responsive pages, not a redrawn design or mocked response.
  await ep.setViewportSize({ width: 390, height: 844 });
  for (const [path, slug, chap] of [
    ["/dashboard", "mobile-beranda", "P1"],
    ["/pengajuan?kind=leave&new=1", "mobile-form-cuti", "P2"],
    ["/profil", "mobile-profil", "P7"],
  ])
    await optional(slug, async () => {
      await ep.goto(path);
      await shot(ep, "pegawai", slug, chap, "Viewport 390×844; data sendiri");
    });
  await optional("mobile navigasi", async () => {
    await ep
      .getByRole("button", { name: /Buka.*menu|Buka.*navigasi/i })
      .click();
    await shot(
      ep,
      "pegawai",
      "mobile-menu",
      "P1",
      "Menu ponsel dan navigasi keyboard",
    );
    await ep.keyboard.press("Escape");
  });
  await optional("mobile upload scan", async () => {
    await detail(ep, pending.id);
    await shot(
      ep,
      "pegawai",
      "mobile-upload",
      "P4",
      "Upload PDF scan pada ponsel",
      ep.getByRole("heading", { name: "Scan Bertanda Tangan", exact: true }),
    );
  });
  await ap.setViewportSize({ width: 390, height: 844 });
  await optional("Admin mobile", async () => {
    await ap.goto("/");
    await shot(
      ap,
      "admin",
      "mobile-pegawai",
      "A2",
      "Kartu pegawai dan aksi ponsel",
    );
  });
  await optional("Logout", async () => {
    await ep.goto("/profil");
    await ep.getByRole("button", { name: "Keluar", exact: true }).click();
    await ep
      .getByRole("heading", { name: "Masuk ke akun Anda", exact: true })
      .waitFor();
    await shot(
      ep,
      "umum",
      "logout",
      "U1",
      "Logout kembali ke login, sesi berakhir",
    );
  });
  // Assert owner boundary with real authenticated API calls; no new authority is inferred by guide.
  assert.equal((await admin.request.get("/api/admin/employees")).status(), 200);
  if (process.env.GUIDES_ONLY) {
    assert.equal(
      (await employee.request.get("/api/admin/employees")).status(),
      403,
    );
    assert.equal(
      (await employee.request.get(`/api/employees/${b.id}`)).status(),
      403,
    );
    assert.equal(
      (await employee.request.get(`/api/employees/${a.id}`)).status(),
      200,
    );
    checks.push({
      scenario:
        "RBAC Admin/Pegawai dan owner isolation melalui sesi login nyata",
      status: "PASS",
    });
  }
  checks.push({
    scenario: "Akses daftar pegawai Admin HTTP 200",
    status: "PASS",
  });
} finally {
  await writeFile(
    `${root}/screenshot-manifest.json`,
    JSON.stringify(
      {
        sourceSha,
        dateWib: "2026-10-18",
        screenshots: manifest,
        checks,
        conditionsNotCaptured: issues,
        fixtureNotes: [
          "Admin bootstrap melalui service Employee/Account existing; bukan injeksi sesi. Semua sesi melalui login UI dan seluruh request bisnis melalui API terautentikasi.",
          "Satu PermissionType reference fixture memakai nama Izin Contoh Dokumentasi. Tidak ada menu/aturan jenis izin baru; bukan katalog resmi.",
          "Tanggal/kuota kebijakan klaim adalah simulasi berlabel fixture, bukan data pemerintah. Overlay simulasi hanya preview, tidak diterbitkan.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  console.log(
    `DONE ${manifest.length} images, ${issues.length} conditions not captured; no credentials/session state saved.`,
  );
}
