import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const { Pool } = require("pg");
if (process.env.SI_CUTI_DISPOSABLE_TEST_DB !== "1" || !process.env.DATABASE_URL)
  throw new Error("Disposable DB required");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const baseURL = process.env.SI_CUTI_M6_TEST_URL || "http://127.0.0.1:3196";
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  headless: true,
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
const year = Number(parts.year),
  month = `${parts.year}-${parts.month}`,
  today = `${month}-${parts.day}`,
  from = `${month}-01`,
  to = new Date(Date.UTC(year, Number(parts.month), 0))
    .toISOString()
    .slice(0, 10);
const suffix = randomUUID().slice(0, 7);
let count = 0;
const requestIds = [];
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex");
  await db.query(
    'INSERT INTO "Employee" (id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES ($1,$2,$3,\'Penguji\',\'Unit Browser Sintetis\',NOW())',
    [
      employee,
      `M6-UI-${employee.slice(0, 24)}`,
      role === "ADMIN_KEPEGAWAIAN"
        ? "Admin Dashboard Sintetis"
        : `Pegawai Kalender Sintetis ${suffix}`,
    ],
  );
  await db.query(
    'INSERT INTO "User" (id,"employeeId",role,"updatedAt") VALUES ($1,$2,$3,NOW())',
    [user, employee, role],
  );
  await db.query(
    'INSERT INTO "AuthenticationIdentity" (id,"userId",provider,"providerSubject","updatedAt") VALUES ($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, employee],
  );
  await db.query(
    'INSERT INTO "Session" (id,"authenticationIdentityId","tokenHash","expiresAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return { employee, user, token };
}
async function leave(owner, i) {
  const id =
      i === 0
        ? `00000000-0000-4000-8000-${randomBytes(6).toString("hex")}`
        : randomUUID(),
    revision = randomUUID();
  requestIds.push(id);
  await db.query(
    'INSERT INTO "LeaveRequest" (id,"employeeId",status,"currentRevisionNumber","updatedAt") VALUES ($1,$2,\'APPROVED\',2,NOW())',
    [id, owner.employee],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision" (id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"leaveAddress","leavePhone","submittedAt","calculatedWorkingDays","updatedAt") VALUES ($1,$2,2,\'ANNUAL\',$3,$4,\'PRIVATE_REASON_BROWSER\',\'PRIVATE_ADDRESS_BROWSER\',\'PRIVATE_PHONE_BROWSER\',NOW(),5,NOW())',
    [revision, id, from, to],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision" (id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"updatedAt") VALUES ($1,$2,1,\'SICK\',\'1900-01-01\',\'1900-01-02\',\'PRIVATE_OLD_REVISION\',NOW())',
    [randomUUID(), id],
  );
  return { id, revision };
}
async function scenario(
  name,
  actor,
  work,
  viewport = { width: 1440, height: 1100 },
) {
  const context = await browser.newContext({ baseURL, viewport });
  context.setDefaultTimeout(10000);
  await context.addCookies([
    { name: "si_cuti_session", value: actor.token, url: baseURL },
  ]);
  try {
    const page = await context.newPage();
    await work(page, context);
    count++;
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}
async function screenshot(page, name) {
  if (!process.env.SI_CUTI_M6_SCREENSHOTS) return;
  await mkdir(process.env.SI_CUTI_M6_SCREENSHOTS, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${process.env.SI_CUTI_M6_SCREENSHOTS}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
try {
  const admin = await actor("ADMIN_KEPEGAWAIAN"),
    owner = await actor("PEGAWAI"),
    other = await actor("PEGAWAI");
  let returned;
  for (let i = 0; i < 14; i++) {
    const v = await leave(owner, i);
    if (i === 0) returned = v;
  }
  await leave(other, 99);
  const evidence = randomUUID();
  await db.query(
    'INSERT INTO "LeaveDocument" (id,"leaveRequestId","revisionId","documentType","storageKey","checksumSha256","sizeBytes",snapshot) VALUES ($1,$2,$3,\'RETURN_BASIS\',$4,$5,10,\'{"private":"PRIVATE_STORAGE_SNAPSHOT"}\')',
    [
      evidence,
      returned.id,
      returned.revision,
      randomBytes(16).toString("hex"),
      "a".repeat(64),
    ],
  );
  await db.query(
    'INSERT INTO "LeaveBalanceReturn" (id,"leaveRequestId","revisionId","entitlementYear","restoredDays",reason,"basisReference","basisDate","evidenceDocumentId","recordedByUserId","recordedAt","idempotencyKey","payloadHash","policyVersion",snapshot) VALUES ($1,$2,$3,$4,1,\'PRIVATE_RETURN_REASON\',\'PRIVATE_BASIS\',$5,$6,$7,NOW(),$8,$9,\'m6-browser\',\'{}\')',
    [
      randomUUID(),
      returned.id,
      returned.revision,
      year,
      today,
      evidence,
      admin.user,
      randomUUID(),
      "b".repeat(64),
    ],
  );
  for (const [bucket, days] of [
    ["N", 12],
    ["N1", 6],
    ["N2", 0],
    ["JOINT_LEAVE_CLAIM", 3],
  ])
    await db.query(
      'INSERT INTO "AnnualBalanceAccount" (id,"employeeId","entitlementYear",bucket,"grantedDays","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), owner.employee, year, bucket, days],
    );
  await scenario(
    "Admin real DB dashboard, bounded agenda, status filters and current-revision detail link",
    admin,
    async (page) => {
      await page.goto("/dashboard");
      await page
        .getByRole("heading", { name: "Ringkasan administrasi", exact: true })
        .waitFor();
      const agenda = page.getByRole("region", {
        name: "Agenda pengajuan",
        exact: true,
      });
      await agenda.locator(".m6-agenda-item").first().waitFor();
      assert.equal(await agenda.locator(".m6-agenda-item").count(), 10);
      await agenda.getByText(/15 pengajuan/).waitFor();
      const grid = page
        .getByLabel(/^Kalender /)
        .filter({ has: page.locator(".m6-weekday") });
      await grid.locator(".m6-calendar-chip").first().waitFor();
      assert.equal(
        await grid
          .locator("button")
          .first()
          .locator(".m6-calendar-chip")
          .count(),
        3,
      );
      assert.ok(
        (await grid.locator(".m6-calendar-chip").first().innerText()).includes(
          "Pegawai Kalender",
        ),
      );
      assert.equal(
        await grid.getByText("+12 lainnya", { exact: true }).count(),
        Number(to.slice(-2)),
      );
      await grid.locator("button").first().click();
      await agenda
        .getByRole("heading", { name: /Agenda Cuti tanggal/ })
        .waitFor();
      assert.equal(
        await agenda
          .getByRole("heading")
          .evaluate((e) => document.activeElement === e),
        true,
      );
      await agenda
        .getByRole("button", { name: "Kembali ke rentang filter" })
        .click();
      await agenda
        .getByRole("button", { name: "Berikutnya", exact: true })
        .click();
      await agenda.getByText("Halaman 2", { exact: true }).waitFor();
      assert.equal(await agenda.locator(".m6-agenda-item").count(), 5);
      await page.getByLabel("Status", { exact: true }).selectOption("REJECTED");
      await agenda
        .getByText("Tidak ada pengajuan pada filter ini.", { exact: true })
        .waitFor();
      await agenda.getByText("Halaman 1", { exact: true }).waitFor();
      const fixed = page.getByRole("region", {
        name: "Ringkasan tetap",
        exact: true,
      });
      await fixed
        .getByText("Pegawai dalam periode cuti disetujui hari ini", {
          exact: true,
        })
        .waitFor();
      const fixedText = await fixed.innerText();
      await page
        .getByLabel("Dari tanggal", { exact: true })
        .fill(`${year + 1}-01-01`);
      await agenda.getByRole("alert").waitFor();
      assert.equal(await fixed.innerText(), fixedText);
      assert.equal(await fixed.getByRole("alert").count(), 0);
      await page
        .getByRole("button", { name: "Reset filter", exact: true })
        .click();
      await agenda.locator(".m6-return").waitFor();
      await screenshot(page, "m6-admin-desktop");
      await agenda
        .getByRole("link", { name: "Lihat pengajuan" })
        .first()
        .click();
      await page
        .getByRole("dialog", { name: "Detail pengajuan", exact: true })
        .waitFor();
      await page
        .getByRole("heading", { name: "Cuti Tahunan", exact: true })
        .first()
        .waitFor();
    },
  );
  await scenario(
    "Pegawai real API owner isolation, private DTO omission and own existing balance",
    owner,
    async (page, context) => {
      await page.goto("/dashboard");
      await page
        .getByRole("heading", { name: "Beranda saya", exact: true })
        .waitFor();
      const saldo = page.getByRole("region", {
        name: "Saldo saya",
        exact: true,
      });
      await saldo.getByText("12 hari", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Kelola kalender hari libur" })
          .count(),
        0,
      );
      assert.equal(await page.getByLabel("Filter pegawai").count(), 0);
      const response = await context.request.get(
        `/api/calendar/agenda?kind=leave&from=${from}&to=${to}`,
      );
      const data = await response.json();
      assert.equal(response.status(), 200);
      assert.equal(data.total, 14);
      const json = JSON.stringify(data);
      for (const text of [
        "PRIVATE_",
        "storageKey",
        "reason",
        "leaveAddress",
        "leavePhone",
        other.employee,
      ])
        assert.equal(json.includes(text), false);
      assert.equal(
        data.items.some((v) => v.employee),
        false,
      );
      assert.equal(
        (
          await context.request.get(
            `/api/calendar/agenda?kind=leave&employeeId=${other.employee}`,
          )
        ).status(),
        403,
      );
      assert.equal(
        (await context.request.get(`/api/dashboard/employees`)).status(),
        403,
      );
      assert.equal(
        (
          await context.request.get(`/api/admin/calendar-overlays?year=${year}`)
        ).status(),
        403,
      );
      assert.equal(
        (
          await context.request.post("/api/admin/calendar-overlays/publish", {
            data: { actorUserId: admin.user },
          })
        ).status(),
        403,
      );
      const cal = await (
        await context.request.get(
          `/api/calendar?kind=leave&from=${from}&to=${to}`,
        )
      ).json();
      assert.ok(cal.days.every((d) => d.entries.length <= 3));
      assert.ok(
        !JSON.stringify(cal).match(/fullName|employee|PRIVATE_|storageKey/),
      );
      assert.ok(
        (await page.locator(".m6-calendar-chip").first().innerText()).includes(
          "Cuti saya",
        ),
      );
      await screenshot(page, "m6-employee-desktop");
    },
  );
  await scenario(
    "Admin real DB overlay preview/confirmation/publication/history and no balance mutation",
    admin,
    async (page) => {
      const before = (
        await db.query(
          'SELECT id,"grantedDays","reservedDays","committedDays" FROM "AnnualBalanceAccount" ORDER BY id',
        )
      ).rows;
      const operationCount = (
        await db.query('SELECT COUNT(*) AS count FROM "AnnualBalanceOperation"')
      ).rows[0].count;
      const exceptions = (
        await db.query(
          'SELECT COUNT(*) AS count FROM "WorkingCalendarException"',
        )
      ).rows[0].count;
      await page.goto("/dashboard");
      await page
        .getByRole("button", { name: "Kelola kalender hari libur" })
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Overlay resmi tahun ${year}`,
        exact: true,
      });
      await dialog
        .getByLabel("Referensi dokumen/SK resmi")
        .fill(`DOKUMEN-SINTETIS-${suffix}`);
      await dialog.getByLabel("Tanggal dokumen", { exact: true }).fill(today);
      await dialog.getByLabel("Tanggal 1", { exact: true }).fill(from);
      await dialog
        .getByLabel("Nama 1", { exact: true })
        .fill(`Overlay Sintetis ${suffix}`);
      await dialog
        .getByRole("button", { name: "Pratinjau overlay", exact: true })
        .click();
      await dialog.getByRole("region", { name: "Pratinjau overlay" }).waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Terbitkan overlay", exact: true })
          .isDisabled(),
        true,
      );
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", { name: "Terbitkan overlay", exact: true })
        .click();
      await dialog.getByText(/berhasil diterbitkan/).waitFor();
      await dialog
        .getByRole("region", { name: "Riwayat versi overlay" })
        .getByText(`DOKUMEN-SINTETIS-${suffix}`, { exact: false })
        .waitFor();
      await screenshot(page, "m6-overlay-admin");
      await dialog.getByRole("button", { name: "Tutup jendela" }).click();
      await page
        .getByText(`LN · Overlay Sintetis ${suffix}`, { exact: true })
        .first()
        .waitFor();
      await page.getByLabel("Libur Nasional", { exact: true }).uncheck();
      assert.equal(
        await page
          .getByText(`LN · Overlay Sintetis ${suffix}`, { exact: true })
          .count(),
        0,
      );
      await page.getByLabel("Libur Nasional", { exact: true }).check();
      assert.deepEqual(
        (
          await db.query(
            'SELECT id,"grantedDays","reservedDays","committedDays" FROM "AnnualBalanceAccount" ORDER BY id',
          )
        ).rows,
        before,
      );
      assert.equal(
        (
          await db.query(
            'SELECT COUNT(*) AS count FROM "AnnualBalanceOperation"',
          )
        ).rows[0].count,
        operationCount,
      );
      assert.equal(
        (
          await db.query(
            'SELECT COUNT(*) AS count FROM "WorkingCalendarException"',
          )
        ).rows[0].count,
        exceptions,
      );
    },
  );
  await scenario(
    "stale overlay publication conflict via real API never overwrites concurrent version",
    admin,
    async (page, context) => {
      await page.goto("/dashboard");
      await page
        .getByRole("button", { name: "Kelola kalender hari libur" })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Referensi dokumen/SK resmi")
        .fill(`STALE-SINTETIS-${suffix}`);
      await dialog.getByLabel("Tanggal dokumen", { exact: true }).fill(today);
      await dialog.getByLabel("Tanggal 1", { exact: true }).fill(from);
      await dialog
        .getByLabel("Nama 1", { exact: true })
        .fill("Versi stale sintetis");
      await dialog
        .getByRole("button", { name: "Pratinjau overlay", exact: true })
        .click();
      await dialog.getByRole("checkbox").waitFor();
      const p = await (
        await context.request.post("/api/admin/calendar-overlays/preview", {
          data: {
            year,
            sourceReference: `CONCURRENT-SINTETIS-${suffix}`,
            sourcePublishedOn: today,
            sourceUrl: "",
            events: [
              {
                date: from,
                name: "Versi konkuren sintetis",
                category: "JOINT_LEAVE",
              },
            ],
          },
        })
      ).json();
      const publish = await context.request.post(
        "/api/admin/calendar-overlays/publish",
        {
          data: {
            data: p.data,
            expectedVersion: p.expectedVersion,
            fingerprint: p.fingerprint,
            idempotencyKey: randomUUID(),
            confirmed: true,
          },
        },
      );
      assert.equal(publish.status(), 200);
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", { name: "Terbitkan overlay", exact: true })
        .click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Terbitkan overlay", exact: true })
          .isDisabled(),
        true,
      );
    },
  );
  await scenario(
    "real Admin JSON import validates source and publishes separate holiday categories",
    admin,
    async (page) => {
      await page.goto("/dashboard");
      await page
        .getByRole("button", { name: "Kelola kalender hari libur" })
        .click();
      const dialog = page.getByRole("dialog");
      const input = dialog.getByLabel("Impor JSON resmi tervalidasi");
      await input.setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ year, actorUserId: "forged", events: [] }),
        ),
      });
      await dialog.getByText(/Dataset tidak valid/).waitFor();
      await input.setInputFiles({
        name: "valid-synthetic.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            year,
            sourceReference: `IMPORT-SINTETIS-${suffix}`,
            sourcePublishedOn: today,
            sourceUrl: "",
            events: [
              {
                date: from,
                name: `Libur Sintetis ${suffix}`,
                category: "PUBLIC_HOLIDAY",
              },
              {
                date: `${month}-02`,
                name: `Bersama Sintetis ${suffix}`,
                category: "JOINT_LEAVE",
              },
            ],
          }),
        ),
      });
      await dialog
        .getByText(
          "File dimuat dan divalidasi. Periksa sumber lalu buat pratinjau untuk publikasi.",
          { exact: true },
        )
        .waitFor();
      await dialog
        .getByRole("button", { name: "Pratinjau overlay", exact: true })
        .click();
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByRole("button", { name: "Terbitkan overlay", exact: true })
        .click();
      await dialog.getByText(/berhasil diterbitkan/).waitFor();
      await dialog
        .getByRole("button", { name: /Lihat versi/ })
        .nth(1)
        .waitFor();
      assert.ok(
        (await dialog.getByRole("button", { name: /Lihat versi/ }).count()) >=
          2,
      );
      await dialog.getByRole("button", { name: "Tutup jendela" }).click();
      await page
        .getByText(`CB · Bersama Sintetis ${suffix}`, { exact: true })
        .first()
        .waitFor();
      await page.getByLabel("Cuti Bersama", { exact: true }).uncheck();
      assert.equal(
        await page
          .getByText(`CB · Bersama Sintetis ${suffix}`, { exact: true })
          .count(),
        0,
      );
      assert.ok(
        (await page
          .getByText(`LN · Libur Sintetis ${suffix}`, { exact: true })
          .count()) > 0,
      );
    },
  );
  await scenario(
    "mobile real dashboard/filter keyboard/Escape with no horizontal overflow",
    admin,
    async (page) => {
      await page.goto("/dashboard");
      await page
        .getByRole("region", { name: "Agenda pengajuan", exact: true })
        .locator(".m6-agenda-item")
        .first()
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const monthToggle = page.getByRole("button", {
        name: "Tampilkan kalender bulanan",
        exact: true,
      });
      assert.equal(await monthToggle.getAttribute("aria-expanded"), "false");
      await monthToggle.click();
      await page.locator(".m6-month-grid").waitFor();
      await page
        .getByRole("button", {
          name: "Sembunyikan kalender bulanan",
          exact: true,
        })
        .click();
      const trigger = page.getByRole("button", {
        name: "Filter periode",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: "Filter periode pengajuan",
      });
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
      await trigger.click();
      await dialog
        .getByLabel("Status", { exact: true })
        .selectOption("REJECTED");
      await dialog
        .getByRole("button", { name: "Selesai", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Agenda pengajuan", exact: true })
        .getByText("Tidak ada pengajuan pada filter ini.", { exact: true })
        .waitFor();
      await screenshot(page, "m6-mobile");
    },
    { width: 390, height: 844 },
  );
  await scenario(
    "small mobile Pegawai balance and separate missing-year overlay state",
    owner,
    async (page) => {
      await page.goto("/dashboard");
      await page
        .getByRole("region", { name: "Saldo saya", exact: true })
        .getByText("12 hari", { exact: true })
        .waitFor();
      const menu = page.getByRole("button", { name: "Buka menu", exact: true });
      await menu.click();
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .locator(".authenticated-sidebar")
          .evaluate((el) => el.contains(document.activeElement)),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      assert.equal(
        await menu.evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByLabel("Bulan", { exact: true }).fill("2078-02");
      await page
        .getByText(
          "Data libur resmi tahun 2078 belum tersedia. Kalender pengajuan tetap berfungsi.",
          { exact: true },
        )
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    },
    { width: 320, height: 740 },
  );
  await scenario(
    "delayed deep-link response cannot override a later workflow tab choice",
    admin,
    async (page) => {
      let unblock, captured;
      const barrier = new Promise((resolve) => {
        unblock = resolve;
      });
      const blocked = new Promise((resolve) => {
        captured = resolve;
      });
      await page.route(
        `**/api/workflow/leave/${returned.id}`,
        async (route) => {
          const response = await route.fetch();
          captured();
          await barrier;
          await route.fulfill({ response });
        },
      );
      await page.goto(`/pengajuan?kind=leave&request=${returned.id}`);
      await blocked;
      await page.getByRole("tab", { name: "Izin", exact: true }).click();
      unblock();
      await page.waitForLoadState("networkidle");
      assert.equal(
        await page
          .getByRole("tab", { name: "Izin", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("dialog", { name: "Detail pengajuan", exact: true })
          .count(),
        0,
      );
    },
  );
  await scenario(
    "mocked agenda loading/error/retry is distinct from empty/zero",
    admin,
    async (page) => {
      let mode = "loading",
        release;
      const barrier = new Promise((r) => {
        release = r;
      });
      await page.route("**/api/calendar/agenda?**", async (route) => {
        if (mode === "loading") await barrier;
        if (mode === "error")
          return route.fulfill({
            status: 503,
            json: { error: "Gangguan sintetis agenda" },
          });
        return route.continue();
      });
      await page.goto("/dashboard");
      const agenda = page.getByRole("region", {
        name: "Agenda pengajuan",
        exact: true,
      });
      await agenda.getByText("Memuat data…", { exact: true }).waitFor();
      assert.equal(
        await agenda
          .getByText("Tidak ada pengajuan pada filter ini.", { exact: true })
          .count(),
        0,
      );
      mode = "error";
      release();
      await agenda.getByRole("alert").waitFor();
      mode = "real";
      await agenda
        .getByRole("button", { name: "Coba lagi", exact: true })
        .click();
      await agenda.locator(".m6-agenda-item").first().waitFor();
    },
  );
  console.log(
    `${count} M6 browser scenarios passed. Seven use real session/API/PostgreSQL; two intercept responses for loading/error/retry and deep-link race.`,
  );
} finally {
  await browser.close();
  await db.query(
    'DELETE FROM "LeaveBalanceReturn" WHERE "leaveRequestId"=ANY($1::uuid[])',
    [requestIds],
  );
  await db.query(
    'DELETE FROM "LeaveDocument" WHERE "leaveRequestId"=ANY($1::uuid[])',
    [requestIds],
  );
  await db.query(
    'DELETE FROM "LeaveRequestRevision" WHERE "leaveRequestId"=ANY($1::uuid[])',
    [requestIds],
  );
  await db.query('DELETE FROM "LeaveRequest" WHERE id=ANY($1::uuid[])', [
    requestIds,
  ]);
  await db.end();
}
