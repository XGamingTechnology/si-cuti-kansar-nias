// Real Next.js + disposable PostgreSQL scenarios; intercepted cases explicitly named MOCK.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash, scryptSync } from "node:crypto";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const { Pool } = require("pg");
assert.equal(
  process.env.SI_CUTI_DISPOSABLE_TEST_DB,
  "1",
  "Disposable DB acknowledgement required",
);
assert.ok(process.env.DATABASE_URL);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const baseURL =
  process.env.SI_CUTI_EMPLOYEE_TEST_URL || "http://127.0.0.1:3197";
const shots = process.env.SI_CUTI_EMPLOYEE_SCREENSHOTS;
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let passed = 0;
const password = "Sintetis-Uji-2026!";
const year = Number(
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date()),
);
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex"),
    nip = `EMP-UI-${employee.slice(0, 24)}`;
  await db.query(
    'INSERT INTO "Employee" (id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES ($1,$2,$3,\'Penguji Sintetis\',\'Unit Pengujian UI\',NOW())',
    [
      employee,
      nip,
      role === "PEGAWAI" ? "Pegawai UI Sintetis" : "Admin UI Sintetis",
    ],
  );
  await db.query(
    'INSERT INTO "User" (id,"employeeId",role,"updatedAt") VALUES ($1,$2,$3,NOW())',
    [user, employee, role],
  );
  await db.query(
    'INSERT INTO "AuthenticationIdentity" (id,"userId",provider,"providerSubject","updatedAt") VALUES ($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, nip],
  );
  const salt = randomBytes(16),
    key = scryptSync(password, salt, 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  await db.query(
    'INSERT INTO "LocalCredential" ("authenticationIdentityId","passwordHash","updatedAt") VALUES ($1,$2,NOW())',
    [
      identity,
      `scrypt$v=1$N=32768,r=8,p=1$${salt.toString("base64url")}$${key.toString("base64url")}`,
    ],
  );
  await db.query(
    'INSERT INTO "Session" (id,"authenticationIdentityId","tokenHash","expiresAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return { employee, user, identity, token, nip };
}
async function leave(a, status, reason) {
  const id = randomUUID(),
    revision = randomUUID();
  await db.query(
    'INSERT INTO "LeaveRequest" (id,"employeeId",status,"currentRevisionNumber","updatedAt") VALUES ($1,$2,$3,1,NOW())',
    [id, a.employee, status],
  );
  await db.query(
    'INSERT INTO "LeaveRequestRevision" (id,"leaveRequestId","revisionNumber","leaveType","startDate","endDate",reason,"submittedAt","updatedAt") VALUES ($1,$2,1,\'ANNUAL\',$3,$4,$5,$6,NOW())',
    [
      revision,
      id,
      `${year}-10-15`,
      `${year}-10-16`,
      reason,
      status === "DRAFT" ? null : new Date(),
    ],
  );
  if (["REJECTED", "RETURNED_FOR_CORRECTION"].includes(status))
    await db.query(
      'INSERT INTO "LeaveRequestTransition" (id,"leaveRequestId","revisionId","fromStatus","toStatus","actorUserId",reason,"occurredAt","idempotencyKey") VALUES ($1,$2,$3,\'SUBMITTED\',$4,$5,$6,\'2026-10-15T17:05:00Z\',$7)',
      [
        randomUUID(),
        id,
        revision,
        status,
        a.user,
        `Catatan ${status} sintetis`,
        randomUUID(),
      ],
    );
  return id;
}
async function scenario(name, a, work, options = {}) {
  if (
    process.env.SI_CUTI_EMPLOYEE_SCENARIOS &&
    !name.includes(process.env.SI_CUTI_EMPLOYEE_SCENARIOS)
  )
    return;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Pacific/Honolulu",
    ...options,
  });
  context.setDefaultTimeout(10000);
  if (a)
    await context.addCookies([
      { name: "si_cuti_session", value: a.token, url: baseURL },
    ]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await work(page, context);
    assert.deepEqual(errors, []);
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(await page.locator("body").innerText());
    await snapshot(page, "failure");
    throw e;
  } finally {
    await context.close();
  }
}
async function snapshot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({
    path: `${shots}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "horizontal overflow",
  );
}
async function login(page, a) {
  await page.goto("/");
  await page.getByLabel("NIP", { exact: true }).fill(a.nip);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}
try {
  const owner = await actor("PEGAWAI"),
    other = await actor("PEGAWAI"),
    admin = await actor("ADMIN_KEPEGAWAIAN");
  const rejected = await leave(owner, "REJECTED", "Alasan permohonan privat"),
    returned = await leave(
      owner,
      "RETURNED_FOR_CORRECTION",
      "Perbaikan privat",
    ),
    approved = await leave(owner, "APPROVED", "Disetujui privat"),
    draft = await leave(owner, "DRAFT", "Draf privat");
  for (let i = 0; i < 9; i++) await leave(owner, "DRAFT", `Draf ${i}`);
  const foreign = await leave(other, "DRAFT", "RAHASIA_PEMILIK_LAIN");
  for (const [bucket, days] of [
    ["N", 12],
    ["N1", 4],
    ["N2", 0],
    ["JOINT_LEAVE_CLAIM", 2],
  ])
    await db.query(
      'INSERT INTO "AnnualBalanceAccount" (id,"employeeId","entitlementYear",bucket,"grantedDays","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), owner.employee, year, bucket, days],
    );
  const permissionType = randomUUID();
  await db.query(
    'INSERT INTO "PermissionType" (id,code,name,"updatedAt") VALUES ($1,$2,\'Izin Pengujian Sintetis\',NOW())',
    [permissionType, `EMP-${permissionType.slice(0, 8)}`],
  );
  await scenario(
    "DB: login Pegawai masuk beranda, saldo existing dan aksi jenis tepat",
    null,
    async (page) => {
      await login(page, owner);
      await page.waitForURL("**/dashboard");
      await page.getByRole("heading", { name: "Beranda saya" }).waitFor();
      await page.getByText("Cuti N-2", { exact: true }).waitFor();
      assert.match(
        await page.getByLabel("Saldo saya", { exact: true }).innerText(),
        /18 hari/,
      );
      await noOverflow(page);
      await snapshot(page, "employee-desktop");
      let writes = 0;
      page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/workflow/"))
          writes++;
      });
      await page
        .getByRole("link", { name: "Ajukan Cuti", exact: true })
        .click();
      await page.getByRole("dialog", { name: "Detail pengajuan" }).waitFor();
      await page.getByLabel("Jenis cuti", { exact: true }).waitFor();
      assert.equal(writes, 0);
      await page.keyboard.press("Escape");
      await page.goBack();
      await page
        .getByRole("link", { name: "Ajukan Izin", exact: true })
        .click();
      await page.getByLabel("Jenis izin", { exact: true }).waitFor();
      assert.equal(writes, 0);
    },
  );
  await scenario(
    "DB: login Admin mempertahankan tujuan lama",
    null,
    async (page) => {
      await login(page, admin);
      await page
        .getByRole("heading", { name: "Kelola Pegawai", exact: true })
        .waitFor();
      assert.equal(new URL(page.url()).pathname, "/");
    },
  );
  await scenario(
    "DB: draf Izin disimpan sekali dan detail hasil terbuka",
    owner,
    async (page) => {
      await page.goto("/pengajuan?kind=permission&new=1");
      const form = page.locator(".workflow-form");
      await form
        .getByLabel("Jenis izin", { exact: true })
        .selectOption(permissionType);
      await form
        .getByLabel("Tanggal mulai", { exact: true })
        .fill(`${year}-10-15`);
      await form
        .getByLabel("Tanggal selesai", { exact: true })
        .fill(`${year}-10-16`);
      await form
        .getByLabel("Alasan", { exact: true })
        .fill("Permohonan izin sintetis");
      let writes = 0;
      page.on("request", (r) => {
        if (
          r.method() === "POST" &&
          new URL(r.url()).pathname === "/api/workflow/permission"
        )
          writes++;
      });
      await form.evaluate((f) => {
        f.requestSubmit();
        f.requestSubmit();
      });
      await page
        .getByText("Draf pengajuan tersimpan.", { exact: true })
        .last()
        .waitFor();
      assert.equal(writes, 1);
      await page
        .getByRole("button", { name: "Ajukan Sekarang", exact: true })
        .waitFor();
    },
  );
  await scenario(
    "DB: terminal vs perbaikan, alasan dan timestamp WIB",
    owner,
    async (page) => {
      await page.goto(`/pengajuan?kind=leave&request=${rejected}`);
      const d = page.getByRole("dialog");
      await d
        .getByText("Catatan REJECTED sintetis", { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await d.getByRole("button", { name: /Ajukan Kembali|Edit/ }).count(),
        0,
      );
      assert.match(await d.innerText(), /16 Oktober 2026.*00.05 WIB/s);
      await page.keyboard.press("Escape");
      await page.goto(`/pengajuan?kind=leave&request=${returned}`);
      await page
        .getByRole("dialog")
        .getByText("Catatan RETURNED_FOR_CORRECTION sintetis", { exact: true })
        .first()
        .waitFor();
      await page
        .getByRole("button", { name: "Ajukan Kembali", exact: true })
        .waitFor();
      await snapshot(page, "employee-correction-desktop");
    },
  );
  await scenario(
    "DB: daftar lokal berhalaman, owner isolation, pesan tidak pindah record",
    owner,
    async (page) => {
      await page.goto("/pengajuan");
      await page.locator(".request-card").first().waitFor();
      assert.equal(await page.locator(".request-card").count(), 10);
      await page
        .getByRole("button", { name: "Halaman berikutnya", exact: true })
        .click();
      assert.equal(await page.locator(".request-card").count(), 3);
      assert.match(
        await page.locator(".employee-pagination-note").innerText(),
        /dimuat sekaligus/,
      );
      const response = await page.request.get(`/api/workflow/leave/${foreign}`);
      assert.equal(response.status(), 403);
      assert.ok(
        !(await page.locator("body").innerText()).includes(
          "RAHASIA_PEMILIK_LAIN",
        ),
      );
      await page.goto(`/pengajuan?kind=leave&request=${draft}`);
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
    },
  );
  await scenario(
    "DB: legacy profil/deep-link, klaim dan kembali",
    owner,
    async (page) => {
      await page.goto("/#profil");
      await page
        .getByRole("heading", { name: "Profil Pegawai", exact: true })
        .waitFor();
      await page.getByText(owner.nip, { exact: true }).waitFor();
      assert.equal(await page.locator(".workflow-surface").count(), 0);
      await page
        .getByRole("link", { name: "Kembali ke beranda", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Klaim Cuti Bersama", exact: true })
        .last()
        .click();
      await page
        .getByRole("heading", { name: /Klaim Cuti Bersama/ })
        .first()
        .waitFor();
      await page.goBack();
      await page.getByRole("heading", { name: "Beranda saya" }).waitFor();
      await page.goto("/#pengajuan");
      await page.waitForURL("**/pengajuan");
    },
  );
  for (const width of [390, 320])
    await scenario(
      `DB: mobile ${width}, agenda utama, dialog Escape/fokus`,
      owner,
      async (page) => {
        await page.goto("/dashboard");
        await page.getByText("Cuti N-2", { exact: true }).waitFor();
        await noOverflow(page);
        assert.equal(await page.locator("#m6-month-region").isVisible(), false);
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
        await snapshot(page, `employee-mobile-${width}`);
        await page.goto("/pengajuan");
        const trigger = page.getByRole("button", {
          name: "+ Pengajuan Baru",
          exact: true,
        });
        await trigger.click();
        await page.getByRole("dialog").waitFor();
        await noOverflow(page);
        await snapshot(page, `employee-form-${width}`);
        await page.keyboard.press("Escape");
        assert.equal(
          await trigger.evaluate((e) => e === document.activeElement),
          true,
        );
      },
      { viewport: { width, height: 844 } },
    );
  await scenario(
    "DB: saldo PARTIAL dan belum disiapkan bukan nol",
    other,
    async (page) => {
      await page.goto("/dashboard");
      await page.getByText(/Saldo belum disiapkan Admin/).waitFor();
      assert.ok(
        !(
          await page.getByLabel("Saldo saya", { exact: true }).innerText()
        ).includes("0 hari"),
      );
      await db.query(
        'INSERT INTO "AnnualBalanceAccount" (id,"employeeId","entitlementYear",bucket,"grantedDays","updatedAt") VALUES ($1,$2,$3,\'N\',12,NOW())',
        [randomUUID(), other.employee, year],
      );
      await page.reload();
      await page.getByText(/Saldo perlu diperiksa Admin/).waitFor();
      assert.ok(
        !(
          await page.getByLabel("Saldo saya", { exact: true }).innerText()
        ).includes("0 hari"),
      );
    },
  );
  await scenario(
    "MOCK: daftar loading/error/retry dan respons jenis lama diabaikan",
    owner,
    async (page) => {
      let release;
      let failed = true;
      await page.route(/\/api\/workflow\/leave$/, async (route) => {
        if (failed) {
          failed = false;
          await route.fulfill({
            status: 500,
            json: { error: "Gagal uji daftar" },
          });
        } else
          await new Promise((resolve) => {
            release = () =>
              route.fulfill({ json: { requests: [] } }).then(resolve);
          });
      });
      await page.goto("/pengajuan");
      await page.getByText("Gagal uji daftar", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Coba lagi", exact: true })
        .click();
      await page.getByText("Memuat pengajuan…", { exact: true }).waitFor();
      await page.getByRole("tab", { name: "Izin", exact: true }).click();
      await page.locator(".request-card").first().waitFor();
      await release();
      assert.match(
        await page.locator(".request-list").innerText(),
        /Izin Pengujian Sintetis/,
      );
    },
  );
  await scenario(
    "MOCK: PDF keputusan tersedia/tidak tersedia dan dokumen dibedakan",
    owner,
    async (page) => {
      let ready = false;
      await page.route(`**/api/workflow/leave/${approved}/decision`, (route) =>
        route.fulfill({
          json: {
            decision: {
              id: randomUUID(),
              sourceDocumentId: null,
              ready,
              snapshot: {
                actorName: "Admin Sintetis",
                occurredAt: "2026-10-15T17:05:00Z",
                sourceDocumentVersion: null,
                reason: null,
              },
            },
          },
        }),
      );
      await page.goto(`/pengajuan?kind=leave&request=${approved}`);
      await page.getByText(/PDF Keputusan Final belum tersedia/).waitFor();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Unduh PDF Keputusan Final",
            exact: true,
          })
          .count(),
        0,
      );
      await page
        .getByRole("heading", { name: "Scan Bertanda Tangan", exact: true })
        .waitFor();
      await page
        .getByRole("heading", { name: "FORMULIR PENGAJUAN CUTI", exact: true })
        .waitFor();
      ready = true;
      await page.reload();
      await page
        .getByRole("button", { name: "Unduh PDF Keputusan Final", exact: true })
        .waitFor();
    },
  );
  await scenario(
    "MOCK: detail lambat tidak menimpa record baru",
    owner,
    async (page) => {
      let release;
      let interceptedResolve;
      const intercepted = new Promise((resolve) => {
        interceptedResolve = resolve;
      });
      await page.route(
        `**/api/workflow/leave/${rejected}/history`,
        (route) =>
          new Promise((resolve) => {
            release = async () => {
              await route.fulfill({
                json: {
                  history: [
                    {
                      id: randomUUID(),
                      fromStatus: "SUBMITTED",
                      toStatus: "REJECTED",
                      occurredAt: "2026-10-15T17:05:00Z",
                      reason: "Catatan REJECTED sintetis",
                    },
                  ],
                },
              });
              resolve();
            };
            interceptedResolve();
          }),
      );
      await page.goto(`/pengajuan?kind=leave&request=${rejected}`);
      await page.getByRole("dialog").waitFor();
      await intercepted;
      // Close while GET is pending, then open a different record without a page navigation.
      await page.keyboard.press("Escape");
      const next = page.locator(".request-card").first();
      const text = await next.innerText();
      await next.click();
      await page.getByRole("dialog").waitFor();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Edit Draf", exact: true })
        .waitFor();
      await release();
      assert.ok(
        !(await page.getByRole("dialog").innerText()).includes(
          "Catatan REJECTED sintetis",
        ),
      );
      assert.ok(text.includes("Draf"));
    },
  );
  await scenario(
    "MOCK: penanda saldo ringkas mempertahankan periode dan penjelasan",
    owner,
    async (page) => {
      await page.route(/\/api\/calendar\/agenda\?/, (route) =>
        route.fulfill({
          json: {
            total: 1,
            nextCursor: null,
            items: [
              {
                requestId: approved,
                kind: "leave",
                status: "APPROVED",
                typeLabel: "Cuti Tahunan",
                startDate: `${year}-10-15`,
                endDate: `${year}-10-16`,
                hasBalanceReturn: true,
              },
            ],
          },
        }),
      );
      await page.goto("/dashboard");
      const marker = page.locator(".m6-return");
      await marker
        .getByText("Ada pengembalian saldo", { exact: true })
        .waitFor();
      assert.equal(await marker.locator("p").isVisible(), false);
      await marker.locator("summary").focus();
      await page.keyboard.press("Enter");
      await marker.locator("p").waitFor();
      assert.match(
        await marker.innerText(),
        /Tanggal penggunaan aktual belum ditentukan/,
      );
      assert.match(
        await page.getByLabel("Agenda pengajuan", { exact: true }).innerText(),
        new RegExp(`15 Oktober ${year} — 16 Oktober ${year}`),
      );
    },
  );
  await scenario(
    "MOCK: detail error menampilkan retry, tanpa loading abadi",
    owner,
    async (page) => {
      let fail = true;
      await page.route(`**/api/workflow/leave/${draft}/history`, (route) => {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 500,
            json: { error: "Detail uji gagal" },
          });
        }
        return route.continue();
      });
      await page.goto(`/pengajuan?kind=leave&request=${draft}`);
      await page
        .getByRole("dialog")
        .getByText("Detail uji gagal", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".workflow-loading").count(), 0);
      await page
        .getByRole("button", { name: "Muat ulang detail", exact: true })
        .click();
      await page
        .getByText("Belum ada perubahan status.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByText("Detail uji gagal", { exact: true }).count(),
        0,
      );
    },
  );
  console.log(
    `${passed} employee UI scenarios passed${process.env.SI_CUTI_EMPLOYEE_SCENARIOS ? " (selected subset)" : " (9 DB + 5 MOCK)"}. Fixtures retained only in disposable DB.`,
  );
} finally {
  await browser.close();
  await db.end();
}
