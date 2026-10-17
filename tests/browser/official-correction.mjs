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
  throw new Error("Disposable test DB is required");
const database = new Pool({ connectionString: process.env.DATABASE_URL });
const baseURL = process.env.SI_CUTI_ADMIN_TEST_URL || "http://127.0.0.1:3191";
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
let count = 0;
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "Employee" (id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES ($1,$2,$3,\'Penguji\',\'Unit Uji\',NOW())',
    [employee, `COR-UI-${employee.slice(0, 20)}`, "Pengguna Koreksi Sintetis"],
  );
  await database.query(
    'INSERT INTO "User" (id,"employeeId",role,"updatedAt") VALUES ($1,$2,$3,NOW())',
    [user, employee, role],
  );
  await database.query(
    'INSERT INTO "AuthenticationIdentity" (id,"userId",provider,"providerSubject","updatedAt") VALUES ($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, employee],
  );
  await database.query(
    'INSERT INTO "Session" (id,"authenticationIdentityId","tokenHash","expiresAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return token;
}
async function scenario(
  name,
  token,
  work,
  viewport = { width: 1440, height: 1000 },
) {
  const context = await browser.newContext({ baseURL, viewport });
  context.setDefaultTimeout(8000);
  await context.addCookies([
    { name: "si_cuti_session", value: token, url: baseURL },
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
let fixtureYear = 1700;
async function fixture(page) {
  const id = randomUUID();
  fixtureYear++;
  while (
    (
      await database.query(
        'SELECT id FROM "LeaveAuthorizedOfficialAssignment" WHERE "effectiveFrom">=$1 AND "effectiveFrom"<$2',
        [`${fixtureYear}-01-01`, `${fixtureYear + 1}-01-01`],
      )
    ).rows.length
  )
    fixtureYear++;
  await database.query(
    'INSERT INTO "LeaveAuthorizedOfficialAssignment" (id,"fullName",nip,capacity,"effectiveFrom","effectiveTo","updatedAt") VALUES ($1,\'Pejabat Browser Sintetis\',\'BROWSER-TEST\',\'DEFINITIVE\',$2,$3,NOW())',
    [id, `${fixtureYear}-01-01`, `${fixtureYear}-12-31`],
  );
  // Only the list is stubbed to isolate a single fixture from other integration rows.
  // Session, history, correction POST, validation, transaction, conflict, and audit use the real API/database.
  await page.route("**/api/admin/leave-authorized-officials", async (route) => {
    const row = (
      await database.query(
        'SELECT * FROM "LeaveAuthorizedOfficialAssignment" WHERE id=$1',
        [id],
      )
    ).rows[0];
    await route.fulfill({
      json: {
        assignments: [
          {
            ...row,
            effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
            effectiveTo: row.effectiveTo.toISOString().slice(0, 10),
          },
        ],
      },
    });
  });
  await page.goto("/admin/pejabat-cuti");
  await page
    .getByRole("button", { name: "Koreksi Darurat", exact: true })
    .click();
  await page.getByText("Belum ada koreksi darurat.", { exact: true }).waitFor();
  return id;
}
async function prepare(page) {
  const dialog = page.getByRole("dialog");
  const review = dialog.getByRole("button", {
    name: "Tinjau perubahan",
    exact: true,
  });
  assert.equal(await review.isDisabled(), true);
  await dialog
    .getByLabel("Nama lengkap", { exact: true })
    .fill("Pejabat Browser Dikoreksi");
  await dialog
    .getByLabel("Alasan koreksi", { exact: true })
    .fill("Pembetulan salah eja pada dokumen sintetis");
  await dialog
    .getByLabel("Referensi dokumen/SK/surat")
    .fill("SK-BROWSER-SINTETIS");
  await review.click();
  await dialog.getByRole("region", { name: "Ringkasan koreksi" }).waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Simpan Koreksi Darurat" })
      .isDisabled(),
    true,
  );
  await dialog.getByRole("checkbox").check();
  return dialog;
}
try {
  const admin = await actor("ADMIN_KEPEGAWAIAN"),
    employee = await actor("PEGAWAI");
  await scenario(
    "real correction requires review/confirmation and displays persisted history",
    admin,
    async (page) => {
      const id = await fixture(page);
      const dialog = await prepare(page);
      await dialog
        .getByRole("button", { name: "Simpan Koreksi Darurat" })
        .click();
      await dialog
        .getByText(
          "Koreksi darurat tersimpan. Arsip dan dokumen lama tetap dipertahankan.",
          { exact: true },
        )
        .waitFor();
      await dialog.getByRole("heading", { name: /Revisi 1/ }).waitFor();
      const result = await database.query(
        'SELECT * FROM "LeaveAuthorizedOfficialCorrection" WHERE "assignmentId"=$1',
        [id],
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].before.fullName, "Pejabat Browser Sintetis");
      assert.equal(result.rows[0].after.fullName, "Pejabat Browser Dikoreksi");
      if (process.env.SI_CUTI_ADMIN_SCREENSHOTS) {
        await mkdir(process.env.SI_CUTI_ADMIN_SCREENSHOTS, { recursive: true });
        await page.screenshot({
          path: `${process.env.SI_CUTI_ADMIN_SCREENSHOTS}/official-correction-history.png`,
        });
      }
    },
  );
  await scenario(
    "stale correction shows conflict and requires refresh/review again",
    admin,
    async (page) => {
      const id = await fixture(page);
      const dialog = await prepare(page);
      await database.query(
        "UPDATE \"LeaveAuthorizedOfficialAssignment\" SET revision=revision+1, notes='Concurrent edit' WHERE id=$1",
        [id],
      );
      await dialog
        .getByRole("button", { name: "Simpan Koreksi Darurat" })
        .click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Simpan Koreksi Darurat" })
          .isDisabled(),
        true,
      );
      assert.equal(
        (
          await database.query(
            'SELECT id FROM "LeaveAuthorizedOfficialCorrection" WHERE "assignmentId"=$1',
            [id],
          )
        ).rows.length,
        0,
      );
      await dialog
        .getByRole("button", { name: "Muat ulang penugasan" })
        .click();
      await dialog
        .getByText("Data terbaru dimuat. Periksa kembali perubahan Anda.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await dialog.getByLabel("Nama lengkap", { exact: true }).inputValue(),
        "Pejabat Browser Sintetis",
      );
      assert.equal(
        await dialog
          .getByRole("button", { name: "Simpan Koreksi Darurat" })
          .count(),
        0,
      );
    },
  );
  await scenario(
    "mobile window focus containment and Escape restoration",
    admin,
    async (page) => {
      await fixture(page);
      const dialog = page.getByRole("dialog");
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390);
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(
        await page
          .getByRole("button", { name: "Koreksi Darurat", exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
    },
    { width: 390, height: 844 },
  );
  await scenario(
    "Pegawai cannot read history or execute correction via real API",
    employee,
    async (_page, context) => {
      const id = randomUUID();
      assert.equal(
        (
          await context.request.get(
            `/api/admin/leave-authorized-officials/${id}/corrections`,
          )
        ).status(),
        403,
      );
      assert.equal(
        (
          await context.request.post(
            `/api/admin/leave-authorized-officials/${id}/corrections`,
            { data: { actorUserId: "forged" } },
          )
        ).status(),
        403,
      );
    },
  );
  console.log(
    `${count} official correction browser scenarios passed. Real correction/history APIs and disposable PostgreSQL; list only stubbed.`,
  );
} finally {
  await browser.close();
  await database.end();
}
