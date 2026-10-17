// Real production-style Next server + non-owner PostgreSQL web role. MOCK scenarios named explicitly.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright"),
  { Pool } = require("pg");
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
assert.ok(
  process.env.SI_CUTI_M7_FIXTURE_DATABASE_URL,
  "Use an explicit disposable fixture database URL",
);
const db = new Pool({
    connectionString: process.env.SI_CUTI_M7_FIXTURE_DATABASE_URL,
  }),
  baseURL = process.env.SI_CUTI_M7_TEST_URL || "http://127.0.0.1:3199",
  out = process.env.SI_CUTI_M7_ARTIFACTS || "/workspace/scratch/m7";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()),
  parts = Object.fromEntries(date.map((v) => [v.type, v.value])),
  from = `${parts.year}-${parts.month}-01`,
  to = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0))
    .toISOString()
    .slice(0, 10);
const suffix = randomUUID().slice(0, 6),
  unit = `Unit M7 Sintetis ${suffix}`;
let passed = 0,
  runId,
  artifactId;
async function actor(role, label) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex"),
    nip = `0000${BigInt("0x" + randomBytes(6).toString("hex"))
      .toString()
      .padStart(14, "0")
      .slice(-14)}`;
  await db.query(
    'INSERT INTO "Employee" (id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES ($1,$2,$3,\'Penguji Sintetis\',$4,NOW())',
    [employee, nip, label, unit],
  );
  await db.query(
    'INSERT INTO "User" (id,"employeeId",role,"updatedAt") VALUES ($1,$2,$3,NOW())',
    [user, employee, role],
  );
  await db.query(
    'INSERT INTO "AuthenticationIdentity" (id,"userId",provider,"providerSubject","updatedAt") VALUES ($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, nip],
  );
  await db.query(
    'INSERT INTO "Session" (id,"authenticationIdentityId","tokenHash","expiresAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return { employee, user, token, nip };
}
async function leave(owner, i, status = "APPROVED") {
  const id = randomUUID(),
    revision = randomUUID();
  await db.query(
    'INSERT INTO "LeaveRequest" (id,"employeeId",status,"currentRevisionNumber","updatedAt") VALUES ($1,$2,$3,2,NOW())',
    [id, owner.employee, status],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision" (id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"leaveAddress","leavePhone","submittedAt","calculatedWorkingDays","updatedAt") VALUES ($1,$2,2,\'ANNUAL\',$3,$4,\'PRIVATE_REASON_M7\',\'PRIVATE_ADDRESS_M7\',\'PRIVATE_PHONE_M7\',NOW(),5,NOW())',
    [revision, id, from, to],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision" (id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"updatedAt") VALUES ($1,$2,3,\'SICK\',\'2023-01-01\',\'2023-01-01\',\'PRIVATE_HIGHER_REVISION\',NOW())',
    [randomUUID(), id],
  );
  return { id, revision };
}
async function scenario(name, who, work, options = {}) {
  if (
    process.env.SI_CUTI_M7_SCENARIOS &&
    !name.includes(process.env.SI_CUTI_M7_SCENARIOS)
  )
    return;
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Pacific/Honolulu",
    ...options,
  });
  ctx.setDefaultTimeout(15000);
  await ctx.addCookies([
    { name: "si_cuti_session", value: who.token, url: baseURL },
  ]);
  const page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await work(page, ctx);
    assert.deepEqual(errors, []);
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    await page.screenshot({ path: `${out}/failure.png` });
    throw e;
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await ctx.close();
  }
}
async function snapshot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${out}/${name}.png`,
    fullPage: false,
    animations: "disabled",
  });
}
async function preview(page) {
  await page.goto("/admin/laporan");
  await page.getByLabel("Unit kerja (persis)", { exact: true }).fill(unit);
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/reports/runs",
  );
  await page
    .getByRole("button", { name: "Buat pratinjau", exact: true })
    .click();
  const r = await response;
  assert.equal(r.status(), 201, await r.text());
  const p = await r.json();
  await page
    .getByRole("region", { name: "Pratinjau laporan", exact: true })
    .waitFor();
  return p;
}
try {
  const admin = await actor("ADMIN_KEPEGAWAIAN", "Admin M7 Sintetis"),
    other = await actor("ADMIN_KEPEGAWAIAN", "Admin M7 Lain Sintetis"),
    owner = await actor("PEGAWAI", "Pegawai M7 Sintetis"),
    inactive = await actor("PEGAWAI", "Pegawai Nonaktif M7 Sintetis");
  await db.query('UPDATE "Employee" SET "isActive"=FALSE WHERE id=$1', [
    inactive.employee,
  ]);
  for (let i = 0; i < 29; i++) await leave(owner, i);
  const returned = await leave(inactive, 99);
  await leave(owner, 100, "RETURNED_FOR_CORRECTION");
  await leave(owner, 101, "REJECTED");
  const doc = randomUUID();
  await db.query(
    'INSERT INTO "LeaveDocument" (id,"leaveRequestId","revisionId","documentType","storageKey","checksumSha256","sizeBytes",snapshot) VALUES ($1,$2,$3,\'RETURN_BASIS\',$4,$5,10,\'{"private":"PRIVATE_DOCUMENT"}\')',
    [
      doc,
      returned.id,
      returned.revision,
      randomBytes(16).toString("hex"),
      "a".repeat(64),
    ],
  );
  await db.query(
    'INSERT INTO "LeaveBalanceReturn" (id,"leaveRequestId","revisionId","entitlementYear","restoredDays",reason,"basisReference","basisDate","evidenceDocumentId","recordedByUserId","recordedAt","idempotencyKey","payloadHash","policyVersion",snapshot) VALUES ($1,$2,$3,$4,2,\'PRIVATE_RETURN\',\'PRIVATE_BASIS\',CURRENT_DATE,$5,$6,NOW(),$7,$8,\'synthetic\',\'{}\')',
    [
      randomUUID(),
      returned.id,
      returned.revision,
      Number(parts.year),
      doc,
      admin.user,
      randomUUID(),
      "b".repeat(64),
    ],
  );
  const permissionType = randomUUID();
  await db.query(
    'INSERT INTO "PermissionType" (id,code,name,"updatedAt") VALUES ($1,$2,\'Izin M7 Sintetis\',NOW())',
    [permissionType, `M7-${suffix}`],
  );
  const permit = randomUUID();
  await db.query(
    'INSERT INTO "PermissionRequest" (id,"employeeId",status,"currentRevisionNumber","updatedAt") VALUES ($1,$2,\'APPROVED\',1,NOW())',
    [permit, owner.employee],
  );
  await db.query(
    'INSERT INTO "PermissionRequestRevision" (id,"permissionRequestId","revisionNumber","permissionTypeId","startDate","endDate",reason,"submittedAt","updatedAt") VALUES ($1,$2,1,$3,$4,$5,\'PRIVATE_PERMISSION\',NOW(),NOW())',
    [randomUUID(), permit, permissionType, from, to],
  );
  await scenario(
    "DB: Admin snapshot, server pagination, real PDF/XLSX downloads and frozen master",
    admin,
    async (page) => {
      const p = await preview(page);
      runId = p.run.id;
      assert.equal(p.run.rowCount, 30);
      assert.equal(p.items.length, 25);
      assert.equal(p.summary.employees, 2);
      assert.equal(p.summary.withBalanceReturn, 1);
      assert.ok(
        !JSON.stringify(p).match(/PRIVATE_|reason|storageKey|datasetKey/),
      );
      await page
        .getByRole("button", { name: "Berikutnya", exact: true })
        .click();
      await page.getByText("26–30 dari 30", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Sebelumnya", exact: true })
        .click();
      await page.getByText("1–25 dari 30", { exact: true }).waitFor();
      await snapshot(page, "admin-report-desktop");
      await db.query(
        'UPDATE "Employee" SET "fullName"=\'Nama Master Berubah Setelah Snapshot\' WHERE id=$1',
        [owner.employee],
      );
      for (const [label, file] of [
        ["Unduh PDF", "r1-report.pdf"],
        ["Unduh Excel", "r1-report.xlsx"],
      ]) {
        const event = page.waitForEvent("download");
        await page.getByRole("button", { name: label, exact: true }).click();
        await (await event).saveAs(`${out}/${file}`);
        await page.getByText(/Berkas mulai dilayani/).waitFor();
      }
      const artifacts = await db.query(
        'SELECT id,format FROM "ReportArtifact" WHERE "runId"=$1',
        [runId],
      );
      assert.equal(artifacts.rows.length, 2);
      artifactId = artifacts.rows[0].id;
      assert.equal(
        (
          await db.query(
            'SELECT COUNT(*)::int AS count FROM "ReportAuditEvent" WHERE "runId"=$1 AND event=\'DOWNLOAD_AUTHORIZED\'',
            [runId],
          )
        ).rows[0].count,
        2,
      );
      await page
        .getByLabel("Cari nama atau NIP", { exact: true })
        .fill("changed");
      assert.equal(
        await page
          .getByRole("button", { name: "Unduh PDF", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByText("Filter berubah. Buat pratinjau baru sebelum mengekspor.", {
          exact: true,
        })
        .waitFor();
    },
  );
  await scenario(
    "DB: Izin separated, empty/status filters and no annual-day column",
    admin,
    async (page) => {
      await page.goto("/admin/laporan");
      await page.getByRole("button", { name: "Izin", exact: true }).click();
      await page.getByLabel("Unit kerja (persis)", { exact: true }).fill(unit);
      await page
        .getByRole("button", { name: "Buat pratinjau", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Pratinjau laporan" })
        .getByRole("heading", { name: "Rekap Izin", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("columnheader", {
            name: "Hari kerja tahunan (revisi)",
            exact: true,
          })
          .count(),
        0,
      );
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .click();
      await (await event).saveAs(`${out}/r2-report.pdf`);
      await page.getByText(/Berkas mulai dilayani/).waitFor();
      const excel = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Unduh Excel", exact: true })
        .click();
      await (await excel).saveAs(`${out}/r2-report.xlsx`);
      await page.getByText(/Berkas mulai dilayani/).waitFor();
      await page
        .getByLabel("Status laporan", { exact: true })
        .selectOption("CANCELLED");
      await page
        .getByRole("button", { name: "Buat pratinjau baru", exact: true })
        .click();
      await page
        .getByText("Tidak ada pengajuan sesuai filter.", { exact: true })
        .waitFor();
    },
  );
  await scenario(
    "DB: Admin B cannot read/export/download A, Pegawai cannot access reporting",
    other,
    async (page, ctx) => {
      for (const [method, path, data] of [
        ["get", `/api/reports/runs/${runId}`],
        [
          "post",
          `/api/reports/runs/${runId}/exports`,
          { format: "PDF", idempotencyKey: randomUUID() },
        ],
        ["get", `/api/reports/runs/${runId}/artifacts/${artifactId}`],
      ]) {
        const r = await ctx.request[method](path, { data });
        assert.equal(r.status(), 403);
      }
    },
  );
  await scenario(
    "DB: Pegawai/anonymous/role changes block old report access",
    owner,
    async (page, ctx) => {
      await page.goto("/dashboard");
      assert.equal(
        await page.getByRole("link", { name: "Laporan", exact: true }).count(),
        0,
      );
      assert.equal(
        (await ctx.request.get(`/api/reports/runs/${runId}`)).status(),
        403,
      );
      await ctx.clearCookies();
      assert.equal(
        (await ctx.request.get(`/api/reports/runs/${runId}`)).status(),
        401,
      );
    },
  );
  await scenario(
    "DB: demotion and deactivation invalidate creator access",
    admin,
    async (_page, ctx) => {
      await db.query("UPDATE \"User\" SET role='PEGAWAI' WHERE id=$1", [
        admin.user,
      ]);
      assert.equal(
        (await ctx.request.get(`/api/reports/runs/${runId}`)).status(),
        403,
      );
      await db.query(
        'UPDATE "User" SET role=\'ADMIN_KEPEGAWAIAN\',"isActive"=FALSE WHERE id=$1',
        [admin.user],
      );
      assert.equal(
        (await ctx.request.get(`/api/reports/runs/${runId}`)).status(),
        401,
      );
      await db.query('UPDATE "User" SET "isActive"=TRUE WHERE id=$1', [
        admin.user,
      ]);
    },
  );
  await scenario(
    "DB: mobile filter keyboard/Escape and responsive preview",
    admin,
    async (page) => {
      await page.goto("/admin/laporan");
      const trigger = page.getByRole("button", {
        name: "Filter laporan",
        exact: true,
      });
      await trigger.click();
      await page
        .getByRole("dialog")
        .getByLabel("Unit kerja (persis)", { exact: true })
        .fill(unit);
      await page.keyboard.press("Escape");
      assert.equal(
        await trigger.evaluate((e) => e === document.activeElement),
        true,
      );
      await page
        .getByRole("button", { name: "Buat pratinjau", exact: true })
        .click();
      await page.getByRole("region", { name: "Pratinjau laporan" }).waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByLabel("Baris per halaman", { exact: true })
        .selectOption("10");
      await page.getByText("1–10 dari 30", { exact: true }).waitFor();
      await snapshot(page, "admin-report-mobile");
      await page
        .getByRole("button", { name: "Buka menu", exact: true })
        .click();
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "Buka menu", exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
      );
    },
    { viewport: { width: 390, height: 844 } },
  );
  await scenario(
    "MOCK: audit/size/expired/busy/conflict errors are distinct, retry preserves key",
    admin,
    async (page) => {
      await page.goto("/admin/laporan");
      let count = 0,
        key;
      const failures = [
        [503, "AUDIT_UNAVAILABLE", "Audit uji tidak tersedia."],
        [429, "REPORT_BUSY", "Uji sedang diproses."],
        [422, "REPORT_TOO_LARGE", "Uji terlalu besar."],
        [409, "RETRY_CONFLICT", "Kunci uji berbeda."],
        [410, "REPORT_EXPIRED", "Laporan uji kedaluwarsa."],
      ];
      await page.route(/\/api\/reports\/runs$/, (route) => {
        const data = route.request().postDataJSON();
        if (!key) key = data.idempotencyKey;
        else if (count < 4) assert.equal(data.idempotencyKey, key);
        else assert.notEqual(data.idempotencyKey, key);
        const [status, code, error] = failures[count++];
        return route.fulfill({ status, json: { code, error } });
      });
      await page
        .getByRole("button", { name: "Buat pratinjau", exact: true })
        .click();
      await page
        .getByRole("alert")
        .getByText("Audit tidak tersedia", { exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Coba lagi permintaan yang sama",
          exact: true,
        })
        .click();
      await page
        .getByRole("alert")
        .getByText("Laporan sedang diproses", { exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Coba lagi permintaan yang sama",
          exact: true,
        })
        .click();
      await page
        .getByRole("alert")
        .getByText("Hasil terlalu besar", { exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Coba lagi permintaan yang sama",
          exact: true,
        })
        .click();
      await page
        .getByRole("alert")
        .getByText("Permintaan berbeda", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Mulai permintaan baru", exact: true })
        .click();
      await page
        .getByRole("alert")
        .getByText("Laporan kedaluwarsa", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("region", { name: "Pratinjau laporan" }).count(),
        0,
      );
    },
  );
  await scenario(
    "MOCK: delayed create cannot overwrite changed filters and double click sends once",
    admin,
    async (page) => {
      await page.goto("/admin/laporan");
      let release,
        requests = 0;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(/\/api\/reports\/runs$/, async (route) => {
        requests++;
        const response = await route.fetch();
        await held;
        await route.fulfill({ response });
      });
      await page
        .getByRole("button", { name: "Buat pratinjau", exact: true })
        .evaluate((b) => {
          b.click();
          b.click();
        });
      await page.getByText("Memproses laporan…", { exact: true }).waitFor();
      await page
        .getByLabel("Status laporan", { exact: true })
        .selectOption("REJECTED");
      release();
      await page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll('[role="status"]')).some(
            (e) => e.textContent === "Memproses laporan…",
          ),
      );
      assert.equal(requests, 1);
      assert.equal(
        await page.getByRole("region", { name: "Pratinjau laporan" }).count(),
        0,
      );
      assert.equal(
        await page.getByLabel("Status laporan", { exact: true }).inputValue(),
        "REJECTED",
      );
    },
  );
  console.log(
    `${passed} M7 browser scenarios passed (${process.env.SI_CUTI_M7_SCENARIOS ? "selected subset" : "6 real DB + 2 MOCK"}). Artifacts: ${out}`,
  );
} finally {
  await browser.close();
  await db.end();
}
