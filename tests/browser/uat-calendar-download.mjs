// Actual sessions/API/disposable DB; intercepted failure/permission/overlay cases explicitly MOCK.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright"),
  { Pool } = require("pg");
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL = process.env.SI_CUTI_UAT_TEST_URL || "http://127.0.0.1:3199",
  out = process.env.SI_CUTI_UAT_ARTIFACTS || "/workspace/scratch/uat";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value]),
);
const month = `${parts.year}-${parts.month}`,
  from = `${month}-01`,
  to = new Date(Date.UTC(+parts.year, +parts.month, 0))
    .toISOString()
    .slice(0, 10),
  unit = `Unit UAT Sintetis ${randomUUID().slice(0, 6)}`;
let passed = 0;
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex");
  await db.query(
    'INSERT INTO "Employee"(id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES($1,$2,$3,\'Penguji\',$4,NOW())',
    [
      employee,
      `UAT-${employee.slice(0, 25)}`,
      `${role === "PEGAWAI" ? "Pegawai" : "Admin"} UAT Sintetis`,
      unit,
    ],
  );
  await db.query(
    'INSERT INTO "User"(id,"employeeId",role,"updatedAt") VALUES($1,$2,$3,NOW())',
    [user, employee, role],
  );
  await db.query(
    'INSERT INTO "AuthenticationIdentity"(id,"userId",provider,"providerSubject","updatedAt") VALUES($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, employee],
  );
  await db.query(
    'INSERT INTO "Session"(id,"authenticationIdentityId","tokenHash","expiresAt") VALUES($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return { employee, user, token };
}
async function scenario(name, who, fn, mobile = false) {
  const ctx = await browser.newContext({
    baseURL,
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1050 },
    timezoneId: "Pacific/Honolulu",
  });
  ctx.setDefaultTimeout(12000);
  await ctx.addCookies([
    { name: "si_cuti_session", value: who.token, url: baseURL },
  ]);
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
    console.log(`PASS ${name}`);
    passed++;
  } catch (e) {
    await page.screenshot({ path: `${out}/failure.png` });
    throw e;
  } finally {
    await ctx.close();
  }
}
async function preview(page) {
  await page.goto("/admin/laporan");
  await page.getByLabel("Unit kerja (persis)").fill(unit);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/reports/runs") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Buat pratinjau", exact: true })
    .click();
  const data = await (await response).json();
  assert.equal(data.run.rowCount, 1);
  await page.getByRole("region", { name: "Pratinjau laporan" }).waitFor();
  return data;
}
async function saveShot(page, name) {
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
}
try {
  const admin = await actor("ADMIN_KEPEGAWAIAN"),
    owner = await actor("PEGAWAI");
  const request = randomUUID();
  await db.query(
    'INSERT INTO "LeaveRequest"(id,"employeeId",status,"updatedAt") VALUES($1,$2,\'APPROVED\',NOW())',
    [request, owner.employee],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision"(id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"updatedAt") VALUES($1,$2,1,\'ANNUAL\',$3,$4,\'PRIVATE_UAT\',NOW())',
    [randomUUID(), request, from, to],
  );
  await scenario(
    "DB: create/export/artifact/browser handoff PDF and XLSX with durable audit; compact filters",
    admin,
    async (page) => {
      const p = await preview(page);
      for (const [label, format] of [
        ["Unduh PDF", "PDF"],
        ["Unduh Excel", "XLSX"],
      ]) {
        const event = page.waitForEvent("download");
        await page.getByRole("button", { name: label, exact: true }).click();
        const download = await event;
        assert.equal(await download.failure(), null);
        const path = `${out}/uat.${format.toLowerCase()}`;
        await download.saveAs(path);
        const b = await readFile(path);
        assert.equal(
          format === "PDF"
            ? b.subarray(0, 4).toString()
            : b.subarray(0, 2).toString(),
          format === "PDF" ? "%PDF" : "PK",
        );
        await page.getByText(/Berkas mulai dilayani/).waitFor();
        assert.equal(await page.locator(".report-error").count(), 0);
      }
      const audit = await db.query(
        'SELECT event FROM "ReportAuditEvent" WHERE "runId"=$1',
        [p.run.id],
      );
      assert.equal(
        audit.rows.filter((r) => r.event === "DOWNLOAD_AUTHORIZED").length,
        2,
      );
      const heights = await page
        .locator(".report-desktop-filters input,.report-desktop-filters select")
        .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
      assert.ok(heights.every((h) => h === 42));
      await saveShot(page, "reports-desktop");
    },
  );
  await scenario(
    "DB: mobile PDF handoff, filter Escape/focus and no overflow",
    admin,
    async (page) => {
      await page.goto("/admin/laporan");
      const trigger = page.getByRole("button", {
        name: "Filter laporan",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: "Filter laporan",
        exact: true,
      });
      await dialog.getByLabel("Unit kerja (persis)").fill(unit);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((e) => document.activeElement === e),
        true,
      );
      await page
        .getByRole("button", { name: "Buat pratinjau", exact: true })
        .click();
      await page.getByRole("region", { name: "Pratinjau laporan" }).waitFor();
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .click();
      const download = await event;
      assert.equal(await download.failure(), null);
      await page.getByText(/Berkas mulai dilayani/).waitFor();
      assert.equal(await page.locator(".report-error").count(), 0);
      await noOverflow(page);
      await saveShot(page, "reports-mobile");
    },
    true,
  );
  await scenario(
    "DB: compact employee home and own calendar desktop/mobile",
    owner,
    async (page) => {
      await page.goto("/dashboard");
      await page
        .getByRole("heading", { name: "Beranda saya", exact: true })
        .waitFor();
      await page.locator(".m6-calendar-chip").first().waitFor();
      assert.ok(
        (await page.locator(".m6-calendar-chip").first().innerText()).includes(
          "Cuti saya",
        ),
      );
      assert.equal(
        await page.locator(".employee-distribution").getAttribute("open"),
        null,
      );
      assert.equal(
        await page.locator(".m6-desktop-filters").getAttribute("open"),
        null,
      );
      const styles = await page
        .locator(".m6-calendar-chip")
        .first()
        .evaluate((e) => ({
          clamp: getComputedStyle(e).webkitLineClamp,
          height: e.getBoundingClientRect().height,
          maximum:
            Number.parseFloat(getComputedStyle(e).lineHeight) * 2 +
            Number.parseFloat(getComputedStyle(e).paddingTop) +
            Number.parseFloat(getComputedStyle(e).paddingBottom),
        }));
      assert.ok(styles.height <= styles.maximum + 1, JSON.stringify(styles));
      assert.equal(styles.clamp, "2");
      await saveShot(page, "employee-home-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await noOverflow(page);
      await saveShot(page, "employee-home-mobile");
    },
  );
  await scenario(
    "MOCK transport: artifact rejection then successful idempotent retry, no stale error",
    admin,
    async (page) => {
      const p = await preview(page);
      let n = 0;
      const keys = [];
      page.on("request", (r) => {
        if (r.url().endsWith("/exports"))
          keys.push(r.postDataJSON().idempotencyKey);
      });
      await page.route(/\/artifacts\//, (route) =>
        ++n === 1 ? route.abort("failed") : route.continue(),
      );
      await page
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .click();
      await page
        .getByRole("alert")
        .getByText(/Mengambil berkas: koneksi terputus/)
        .waitFor();
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Coba lagi permintaan yang sama" })
        .click();
      await event;
      await page.getByText(/Berkas mulai dilayani/).waitFor();
      assert.equal(await page.locator(".report-error").count(), 0);
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1]);
      assert.equal(
        (
          await db.query('SELECT id FROM "ReportArtifact" WHERE "runId"=$1', [
            p.run.id,
          ])
        ).rows.length,
        1,
      );
    },
  );
  await scenario(
    "MOCK responses: HTML artifact/session expiry/export audit failure stay separate",
    admin,
    async (page) => {
      await preview(page);
      await page.route(/\/artifacts\//, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "Login" }),
      );
      await page
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .click();
      await page
        .getByRole("alert")
        .getByText(/Mengambil berkas: respons bukan berkas/)
        .waitFor();
      await page.unroute(/\/artifacts\//);
      await page.route(/\/exports$/, (route) =>
        route.fulfill({ status: 401, contentType: "text/html", body: "Login" }),
      );
      await page
        .getByRole("button", { name: "Coba lagi permintaan yang sama" })
        .click();
      await page
        .getByRole("alert")
        .getByText(/Menyiapkan ekspor: sesi berakhir/)
        .waitFor();
      await page.unroute(/\/exports$/);
      await page.route(/\/exports$/, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Audit tidak tersedia", code: "AUDIT_UNAVAILABLE" },
        }),
      );
      await page
        .getByRole("button", { name: "Coba lagi permintaan yang sama" })
        .click();
      await page
        .getByRole("alert")
        .getByText("Audit tidak tersedia", { exact: true })
        .waitFor();
    },
  );
  await scenario(
    "MOCK delayed artifact: changed filter discards late download and error",
    admin,
    async (page) => {
      await preview(page);
      let release;
      const held = new Promise((r) => (release = r));
      await page.route(/\/artifacts\//, async (route) => {
        const response = await route.fetch();
        await held;
        await route.fulfill({ response });
      });
      let downloads = 0;
      page.on("download", () => downloads++);
      const fetched = page.waitForRequest(/\/artifacts\//);
      await page
        .getByRole("button", { name: "Unduh PDF", exact: true })
        .click();
      await fetched;
      await page.getByLabel("Status laporan").selectOption("REJECTED");
      release();
      await page
        .getByText("Memproses laporan…", { exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(downloads, 0);
      assert.equal(await page.locator(".report-error").count(), 0);
      assert.equal(await page.getByText(/Berkas mulai dilayani/).count(), 0);
    },
  );
  for (const state of ["loading", "error", "empty", "available"]) {
    await scenario(
      `MOCK permission types: ${state}, no implicit record creation`,
      owner,
      async (page) => {
        let release,
          writes = 0;
        const held = new Promise((r) => (release = r));
        page.on("request", (r) => {
          if (r.method() === "POST" && r.url().includes("/api/workflow/"))
            writes++;
        });
        await page.route("**/api/workflow/permission-types", async (route) => {
          if (state === "loading") await held;
          if (state === "error")
            return route.fulfill({
              status: 500,
              json: { error: "synthetic failure" },
            });
          return route.fulfill({
            json: {
              permissionTypes:
                state === "empty"
                  ? []
                  : [
                      {
                        id: randomUUID(),
                        name: "Jenis UAT Sintetis",
                        code: "UAT",
                        isActive: true,
                      },
                    ],
            },
          });
        });
        await page.goto("/pengajuan?kind=permission&new=1");
        const form = page.locator(".workflow-form");
        await form.waitFor();
        const select = form.getByLabel("Jenis izin", { exact: true }),
          save = form.getByRole("button", { name: "Simpan Draf" });
        if (state === "loading") {
          await form
            .getByText("Memuat jenis izin…", { exact: true })
            .last()
            .waitFor();
          assert.equal(await save.isDisabled(), true);
          release();
          await select
            .getByRole("option", { name: "Jenis UAT Sintetis" })
            .waitFor({ state: "attached" });
          assert.equal(await save.isEnabled(), true);
        } else if (state === "error") {
          await form.getByRole("alert").waitFor();
          assert.equal(await save.isDisabled(), true);
          await page.unroute("**/api/workflow/permission-types");
          await form
            .getByRole("button", { name: "Muat ulang jenis izin" })
            .click();
          await select
            .getByRole("option", { name: /Izin/ })
            .first()
            .waitFor({ state: "attached" });
        } else if (state === "empty") {
          await form.getByText(/Belum ada jenis izin aktif/).waitFor();
          assert.equal(await select.isDisabled(), true);
          assert.equal(await save.isDisabled(), true);
          await saveShot(page, "permission-empty-mobile");
        } else {
          await select
            .getByRole("option", { name: "Jenis UAT Sintetis" })
            .waitFor({ state: "attached" });
          assert.equal(await select.isEnabled(), true);
          assert.equal(await save.isEnabled(), true);
        }
        assert.equal(writes, 0);
        await noOverflow(page);
      },
      state === "empty",
    );
  }
  await scenario(
    "MOCK holiday overlay only: weekend/public/joint overlap, selected date and mobile chips",
    admin,
    async (page) => {
      const saturday = Array.from(
        { length: +to.slice(-2) },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      ).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6);
      await page.route("**/api/calendar/overlays?*", (route) =>
        route.fulfill({
          json: {
            status: "AVAILABLE",
            year: +parts.year,
            dataset: {
              version: 1,
              sourceReference: "FIXTURE SINTETIS, BUKAN DATA PEMERINTAH",
              sourceUrl: "",
              sourcePublishedOn: from,
              publishedAt: new Date().toISOString(),
              events: [
                {
                  date: saturday,
                  name: "Libur UAT Sintetis",
                  category: "PUBLIC_HOLIDAY",
                },
                {
                  date: saturday,
                  name: "Bersama UAT Sintetis",
                  category: "JOINT_LEAVE",
                },
              ],
            },
          },
        }),
      );
      await page.goto("/dashboard");
      await page
        .getByRole("button", { name: "Tampilkan kalender bulanan" })
        .click();
      const date = page.locator(`.m6-month-grid button`).filter({
        has: page.getByText("LN · Libur UAT Sintetis", { exact: true }),
      });
      await date.waitFor();
      assert.ok((await date.getAttribute("class")).includes("red-date"));
      await date
        .getByText("CB · Bersama UAT Sintetis", { exact: true })
        .waitFor();
      assert.equal(await date.locator(".m6-calendar-chip").count(), 3);
      await date.click();
      assert.equal(await date.getAttribute("aria-pressed"), "true");
      await page
        .getByRole("heading", { name: /Agenda Cuti tanggal/ })
        .waitFor();
      await noOverflow(page);
      await date.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/calendar-mobile.png` });
    },
    true,
  );
  console.log(
    `${passed} UAT browser scenarios passed (3 real DB home/download; 8 MOCK transport/types/overlay, all real sessions).`,
  );
} finally {
  await browser.close();
  await db.end();
}
