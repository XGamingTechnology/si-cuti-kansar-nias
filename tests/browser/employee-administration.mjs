// All sessions are real. MOCK-labelled cases interpose only the documented failure/late response.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { templateWorkbook } from "../../src/infrastructure/spreadsheet/workbook.ts";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright"),
  { Pool } = require("pg");
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL = process.env.SI_CUTI_ADMIN_TEST_URL || "http://127.0.0.1:3199",
  out =
    process.env.SI_CUTI_EMPLOYEE_ADMIN_ARTIFACTS ||
    "/workspace/scratch/employee-admin";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const marker = randomUUID().slice(0, 8);
let passed = 0;
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex");
  await db.query(
    'INSERT INTO "Employee"(id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES($1,$2,$3,\'Penguji\',\'Unit Sesi\',NOW())',
    [employee, `SE-${marker}-${role.slice(0, 5)}`, `Sesi ${role} ${marker}`],
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
  });
  ctx.setDefaultTimeout(12000);
  if (who)
    await ctx.addCookies([
      { name: "si_cuti_session", value: who.token, url: baseURL },
    ]);
  const page = await ctx.newPage();
  try {
    await fn(page, ctx);
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    await page.screenshot({ path: `${out}/failure.png` });
    throw new Error(String(e?.message ?? e).split("Call log:")[0]);
  } finally {
    await ctx.close();
  }
}
const admin = await actor("ADMIN_KEPEGAWAIAN"),
  pegawai = await actor("PEGAWAI"),
  rows = [];
for (let i = 1; i <= 13; i++) {
  const id = randomUUID(),
    name = `Direktori Sintetis ${marker} ${String(i).padStart(2, "0")}`,
    nip = `0000${marker}${String(i).padStart(8, "0")}`;
  await db.query(
    'INSERT INTO "Employee"(id,nip,"fullName","positionTitle","workUnit","isActive","updatedAt") VALUES($1,$2,$3,\'Penguji\',$4,$5,NOW())',
    [id, nip, name, i % 2 ? "Unit A Sintetis" : "Unit B Sintetis", i !== 13],
  );
  rows.push({ id, name, nip });
}
const open = async (page) => {
  await page.goto("/");
  await page
    .getByRole("heading", { name: "Kelola Pegawai", exact: true })
    .waitFor();
  await page
    .getByLabel("Cari pegawai", { exact: true })
    .fill(`Direktori Sintetis ${marker}`);
  await page
    .getByText("Memuat data pegawai…", { exact: true })
    .waitFor({ state: "hidden" });
};
async function detail(page, name) {
  await page
    .getByRole("button", { name: `Lihat detail ${name}`, exact: true })
    .filter({ visible: true })
    .click();
  return page.getByRole("dialog", { name, exact: true });
}
try {
  await scenario(
    "DB: anonymous/Pegawai denied on all admin operations; own profile isolation remains",
    null,
    async (_p, ctx) => {
      for (const who of [null, pegawai]) {
        if (who)
          await ctx.addCookies([
            { name: "si_cuti_session", value: who.token, url: baseURL },
          ]);
        const expected = who ? 403 : 401;
        for (const [method, path, data] of [
          ["GET", "/api/admin/employees"],
          ["POST", "/api/admin/employees", {}],
          ["PATCH", `/api/admin/employees/${rows[0].id}`, {}],
          [
            "PATCH",
            `/api/admin/employees/${rows[0].id}/status`,
            { isActive: false },
          ],
          ["GET", "/api/admin/employees/template"],
          ["POST", "/api/admin/employees/import", {}],
          ["PUT", "/api/admin/employees/import", {}],
          ["GET", `/api/admin/employees/${rows[0].id}/account`],
          ["POST", `/api/admin/employees/${rows[0].id}/account`, {}],
          ["PATCH", `/api/admin/employees/${rows[0].id}/account`, {}],
          ["PATCH", `/api/admin/employees/${rows[0].id}/account/password`, {}],
        ])
          assert.equal(
            (
              await ctx.request.fetch(path, {
                method,
                ...(data ? { data } : {}),
              })
            ).status(),
            expected,
            `${who?.user} ${path}`,
          );
      }
      assert.equal(
        (await ctx.request.get(`/api/employees/${pegawai.employee}`)).status(),
        200,
      );
      assert.equal(
        (await ctx.request.get(`/api/employees/${admin.employee}`)).status(),
        403,
      );
    },
  );
  await scenario(
    "DB: active/archive/all, name/NIP/unit and local pagination resets",
    admin,
    async (page) => {
      await open(page);
      assert.equal(
        await page.locator(".employee-toolbar select").nth(0).inputValue(),
        "active",
      );
      await page.getByText("1–10 dari 12", { exact: true }).waitFor();
      await page.getByLabel("Halaman berikutnya", { exact: true }).click();
      await page.getByText("11–12 dari 12", { exact: true }).waitFor();
      await page
        .locator(".employee-toolbar select")
        .nth(1)
        .selectOption("Unit A Sintetis");
      await page.getByText("1–6 dari 6", { exact: true }).waitFor();
      await page
        .locator(".employee-toolbar select")
        .nth(0)
        .selectOption("inactive");
      await page
        .getByRole("button", {
          name: `Lihat detail ${rows[12].name}`,
          exact: true,
        })
        .filter({ visible: true })
        .waitFor();
      await page.locator(".employee-toolbar select").nth(1).selectOption("");
      await page.locator(".employee-toolbar select").nth(0).selectOption("all");
      await page.getByText("1–10 dari 13", { exact: true }).waitFor();
      await page.getByLabel("Cari pegawai", { exact: true }).fill(rows[0].nip);
      await page.getByText("1–1 dari 1", { exact: true }).waitFor();
      await page
        .getByLabel("Cari pegawai", { exact: true })
        .fill(`Direktori Sintetis ${marker}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
    },
  );
  await scenario(
    "DB: create/edit, duplicate and stale edit; self-supervisor denied",
    admin,
    async (page, ctx) => {
      await open(page);
      await page
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Tambah Pegawai",
        exact: true,
      });
      const nip = `MAN-${marker}`;
      await dialog.getByLabel("NIP", { exact: true }).fill(nip);
      await dialog
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Manual Sintetis");
      await dialog.getByLabel("Jabatan", { exact: true }).fill("Penguji");
      await dialog
        .getByLabel("Unit kerja", { exact: true })
        .fill("Unit Baru Sintetis");
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [nip]))
          .rowCount,
        0,
      );
      await dialog
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      const saved = (
        await db.query('SELECT * FROM "Employee" WHERE nip=$1', [nip])
      ).rows[0];
      assert.ok(saved);
      assert.equal(
        (
          await db.query('SELECT id FROM "User" WHERE "employeeId"=$1', [
            saved.id,
          ])
        ).rowCount,
        0,
      );
      await page.getByLabel("Cari pegawai", { exact: true }).fill(nip);
      dialog = await detail(page, "Manual Sintetis");
      await dialog
        .getByRole("button", { name: "Edit Pegawai", exact: true })
        .click();
      dialog = page.getByRole("dialog", { name: "Edit Pegawai", exact: true });
      await dialog
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Nama Form Lama");
      const changed = await ctx.request.patch(
        `/api/admin/employees/${saved.id}`,
        {
          headers: { "if-match": `"${saved.updatedAt.toISOString()}"` },
          data: {
            nip,
            fullName: "Nama Server Baru",
            positionTitle: "Penguji",
            workUnit: "Unit Baru Sintetis",
            directSupervisorId: null,
          },
        },
      );
      assert.equal(changed.status(), 200);
      await dialog
        .getByRole("button", { name: "Simpan Perubahan", exact: true })
        .click();
      await dialog.getByText(/Data pegawai telah berubah/).waitFor();
      assert.equal(
        (
          await db.query('SELECT "fullName" FROM "Employee" WHERE id=$1', [
            saved.id,
          ])
        ).rows[0].fullName,
        "Nama Server Baru",
      );
      await page.keyboard.press("Escape");
      const current = (
        await (await ctx.request.get(`/api/admin/employees/${saved.id}`)).json()
      ).employee;
      assert.equal(
        (
          await ctx.request.patch(`/api/admin/employees/${saved.id}`, {
            headers: { "if-match": `"${current.updatedAt}"` },
            data: {
              ...{
                nip,
                fullName: current.fullName,
                positionTitle: current.positionTitle,
                workUnit: current.workUnit,
              },
              directSupervisorId: saved.id,
            },
          })
        ).status(),
        422,
      );
      assert.equal(
        (
          await ctx.request.post("/api/admin/employees", {
            data: {
              nip,
              fullName: "Duplikat",
              positionTitle: "Uji",
              workUnit: "Unit",
            },
          })
        ).status(),
        409,
      );
    },
  );
  await scenario(
    "DB: lifecycle confirmation, archive and old session stays revoked after reactivation",
    admin,
    async (page, ctx) => {
      await page.goto("/");
      await page
        .getByLabel("Cari pegawai", { exact: true })
        .fill(`Sesi PEGAWAI ${marker}`);
      let dialog = await detail(page, `Sesi PEGAWAI ${marker}`);
      await dialog
        .getByRole("button", { name: "Nonaktifkan Pegawai", exact: true })
        .click();
      const confirmation = page.getByRole("dialog", {
        name: "Nonaktifkan Pegawai?",
        exact: true,
      });
      await confirmation.waitFor();
      await page.keyboard.press("Escape");
      assert.equal(
        (
          await db.query('SELECT "isActive" FROM "Employee" WHERE id=$1', [
            pegawai.employee,
          ])
        ).rows[0].isActive,
        true,
      );
      await dialog
        .getByRole("button", { name: "Nonaktifkan Pegawai", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ya, nonaktifkan", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      await page
        .locator(".employee-toolbar select")
        .nth(0)
        .selectOption("inactive");
      dialog = await detail(page, `Sesi PEGAWAI ${marker}`);
      await dialog
        .getByRole("button", { name: "Aktifkan Pegawai", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ya, aktifkan kembali", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      const old = await browser.newContext({ baseURL });
      await old.addCookies([
        { name: "si_cuti_session", value: pegawai.token, url: baseURL },
      ]);
      assert.equal(
        (await old.request.get(`/api/employees/${pegawai.employee}`)).status(),
        401,
      );
      await old.close();
      assert.equal(
        (
          await ctx.request.get(
            `/api/admin/employees/${pegawai.employee}/account`,
          )
        ).status(),
        200,
      );
    },
  );
  await scenario(
    "DB: invalid preview is diagnosed and known stale-commit error unlocks correction",
    admin,
    async (page, ctx) => {
      await open(page);
      await page
        .getByRole("button", { name: "Impor Pegawai", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
          name: "Impor Pegawai",
          exact: true,
        }),
        fresh = `FIX-${marker}`;
      const headers = [
        "NIP",
        "Nama Lengkap",
        "Jabatan",
        "Unit Kerja",
        "Status Aktif",
      ];
      const upload = async (rows) =>
        dialog.getByLabel("Pilih workbook", { exact: true }).setInputFiles({
          name: "validasi.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: Buffer.from(templateWorkbook([headers, ...rows], "Pegawai")),
        });
      await upload([
        [rows[0].nip, "Duplikat", "Uji", "Unit", "TRUE"],
        [fresh, "Baru", "Uji", "Unit", "TRUE"],
      ]);
      await dialog
        .getByRole("button", { name: "Preview & Validasi", exact: true })
        .click();
      await dialog.getByText(/NIP: NIP sudah terdaftar/).waitFor();
      assert.equal(
        await dialog
          .getByRole("button", {
            name: "Konfirmasi Impor Pegawai",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [fresh]))
          .rowCount,
        0,
      );
      await upload([[fresh, "Baru", "Uji", "Unit", "TRUE"]]);
      await dialog
        .getByRole("button", { name: "Preview & Validasi", exact: true })
        .click();
      await dialog
        .getByText("Semua baris valid dan siap diimpor.", { exact: true })
        .waitFor();
      assert.equal(
        (
          await ctx.request.post("/api/admin/employees", {
            data: {
              nip: fresh,
              fullName: "Admin Lain Sintetis",
              positionTitle: "Uji",
              workUnit: "Unit",
            },
          })
        ).status(),
        201,
      );
      await dialog
        .getByRole("button", { name: "Konfirmasi Impor Pegawai", exact: true })
        .click();
      await dialog.getByText(/Impor dibatalkan/).waitFor();
      assert.equal(
        await dialog.getByLabel("Pilih workbook", { exact: true }).isEnabled(),
        true,
      );
      assert.equal(
        await dialog
          .getByRole("button", {
            name: "Konfirmasi Impor Pegawai",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [fresh]))
          .rowCount,
        1,
      );
    },
  );
  await scenario(
    "DB + MOCK lost response after real commit: import retry/reopen never duplicates",
    admin,
    async (page, ctx) => {
      await open(page);
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Unduh Template Pegawai", exact: true })
        .click();
      assert.equal(
        (await download).suggestedFilename(),
        "template-pegawai.xlsx",
      );
      const nip = `0000000${marker}123456789012`,
        bytes = templateWorkbook(
          [
            ["NIP", "Nama Lengkap", "Jabatan", "Unit Kerja", "Status Aktif"],
            [nip, "Impor Sintetis", "Penguji", "Unit Impor", "TRUE"],
          ],
          "Pegawai",
        );
      await page
        .getByRole("button", { name: "Impor Pegawai", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Impor Pegawai",
        exact: true,
      });
      await dialog.getByLabel("Pilih workbook", { exact: true }).setInputFiles({
        name: "pegawai.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
      await dialog
        .getByRole("button", { name: "Preview & Validasi", exact: true })
        .click();
      await dialog
        .getByText("Semua baris valid dan siap diimpor.", { exact: true })
        .waitFor();
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [nip]))
          .rowCount,
        0,
      );
      let lost = false;
      const keys = [];
      await page.route("**/api/admin/employees/import", async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        keys.push(route.request().headers()["idempotency-key"]);
        if (!lost) {
          lost = true;
          const actual = await route.fetch();
          assert.equal(actual.status(), 201);
          return route.abort("failed");
        }
        return route.continue();
      });
      await dialog
        .getByRole("button", { name: "Konfirmasi Impor Pegawai", exact: true })
        .click();
      await dialog.getByText(/Hasil konfirmasi belum diketahui/).waitFor();
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [nip]))
          .rowCount,
        1,
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Impor Pegawai", exact: true })
        .click();
      dialog = page.getByRole("dialog", { name: "Impor Pegawai", exact: true });
      await dialog
        .getByRole("button", { name: "Coba konfirmasi lagi", exact: true })
        .click();
      await dialog.getByText(/Berhasil: 1. Dilewati: 0. Gagal: 0./).waitFor();
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1]);
      assert.equal(
        (await db.query('SELECT id FROM "Employee" WHERE nip=$1', [nip]))
          .rowCount,
        1,
      );
      assert.equal(
        (
          await db.query(
            'SELECT id FROM "EmployeeAdministrationEvent" WHERE "idempotencyKey"=$1',
            [keys[0]],
          )
        ).rowCount,
        1,
      );
      await ctx.request.get("/api/admin/employees");
    },
  );
  await scenario(
    "DB: mobile dialog, keyboard Escape/focus and no horizontal overflow",
    admin,
    async (page) => {
      await open(page);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const trigger = page
        .getByRole("button", {
          name: `Lihat detail ${rows[0].name}`,
          exact: true,
        })
        .filter({ visible: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: rows[0].name,
        exact: true,
      });
      await dialog.waitFor();
      await page.keyboard.press("Tab");
      assert.ok(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
      );
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${out}/mobile.png`, fullPage: false });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
    },
    true,
  );
  await scenario(
    "MOCK list failure/retry: no fabricated zero and filters restored",
    admin,
    async (page) => {
      let fail = true;
      await page.route("**/api/admin/employees", async (route) => {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { error: "Gangguan sintetis" },
          });
        }
        return route.continue();
      });
      await page.goto("/");
      await page
        .getByText("Data pegawai belum dapat dimuat", { exact: true })
        .waitFor();
      assert.deepEqual(
        await page.locator(".directory-summary strong").allTextContents(),
        ["—", "—", "—", "—"],
      );
      await page
        .getByRole("button", { name: "Coba lagi", exact: true })
        .click();
      await page.locator(".employee-toolbar select").first().waitFor();
      assert.equal(
        await page.locator(".employee-toolbar select").first().inputValue(),
        "active",
      );
      let templateFail = true;
      await page.route("**/api/admin/employees/template", async (route) => {
        if (templateFail) {
          templateFail = false;
          return route.fulfill({
            status: 503,
            body: "non-JSON synthetic upstream error",
          });
        }
        return route.continue();
      });
      await page
        .getByRole("button", { name: "Unduh Template Pegawai", exact: true })
        .click();
      await page.getByText(/Template belum dapat diunduh/).waitFor();
      const downloaded = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Unduh Template Pegawai", exact: true })
        .click();
      assert.equal(
        (await downloaded).suggestedFilename(),
        "template-pegawai.xlsx",
      );
    },
  );
  await scenario(
    "MOCK account failure/retry and late A response cannot contaminate B",
    admin,
    async (page) => {
      await open(page);
      await page.waitForLoadState("networkidle");
      let failed = false;
      await page.route(
        `**/api/admin/employees/${rows[0].id}/account`,
        async (route) => {
          if (!failed) {
            failed = true;
            return route.fulfill({
              status: 503,
              json: { error: "Status akun sintetis gagal" },
            });
          }
          return route.continue();
        },
      );
      let dialog = await detail(page, rows[0].name);
      await dialog
        .getByRole("button", { name: "Coba lagi status akun", exact: true })
        .waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Buat Akun", exact: true })
          .count(),
        0,
      );
      await dialog
        .getByRole("button", { name: "Coba lagi status akun", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Buat Akun", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      let release;
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      let entered;
      const enteredPromise = new Promise((resolve) => {
        entered = resolve;
      });
      await page.route(
        `**/api/admin/employees/${rows[0].id}/account`,
        async (route) => {
          entered();
          await hold;
          await route.fulfill({
            status: 503,
            json: { error: "Respons akun A yang terlambat" },
          });
        },
      );
      dialog = await detail(page, rows[0].name);
      await enteredPromise;
      await page.keyboard.press("Escape");
      dialog = await detail(page, rows[1].name);
      await dialog
        .getByRole("button", { name: "Buat Akun", exact: true })
        .waitFor();
      release();
      await page.waitForLoadState("networkidle");
      assert.equal(
        await dialog
          .getByText("Respons akun A yang terlambat", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await dialog
          .getByRole("button", { name: "Buat Akun", exact: true })
          .count(),
        1,
      );
    },
  );
  console.log(
    `${passed} employee administration browser scenarios passed (6 without interception; 3 MOCK failure/late-response cases, including lost response after real commit). Safari/iPad not tested.`,
  );
} finally {
  await browser.close();
  await db.end();
}
