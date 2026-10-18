import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const { Client } = require("pg");
assert.ok(
  process.env.DATABASE_URL,
  "Supply a disposable test database, never production.",
);
const baseURL = process.env.SI_CUTI_ADMIN_TEST_URL || "http://127.0.0.1:3101";
const screenshots = process.env.SI_CUTI_ADMIN_SCREENSHOTS;
const database = new Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
const employees = [],
  users = [],
  identities = [];
const browser = await chromium.launch({
  ...(process.env.SI_CUTI_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox"],
});
let passed = 0;
async function actor(role) {
  const id = randomUUID(),
    user = randomUUID(),
    identity = randomUUID();
  const nip = `UI-${id.slice(0, 24)}`;
  await database.query(
    'INSERT INTO "Employee" (id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [
      id,
      nip,
      role === "PEGAWAI" ? "Pegawai Uji Antarmuka" : "Admin Uji Antarmuka",
      "Jabatan Pengujian",
      "Unit Pengujian",
    ],
  );
  employees.push(id);
  await database.query(
    'INSERT INTO "User" (id,"employeeId",role,"updatedAt") VALUES ($1,$2,$3,NOW())',
    [user, id, role],
  );
  users.push(user);
  await database.query(
    'INSERT INTO "AuthenticationIdentity" (id,"userId",provider,"providerSubject","updatedAt") VALUES ($1,$2,\'LOCAL\',$3,NOW())',
    [identity, user, nip],
  );
  identities.push(identity);
  const token = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "Session" (id,"authenticationIdentityId","tokenHash","expiresAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\')',
    [randomUUID(), identity, createHash("sha256").update(token).digest("hex")],
  );
  return token;
}
function fixture() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    nip: `DEMO-UI-${String(i + 1).padStart(3, "0")}`,
    fullName: `Pegawai Uji ${String(i + 1).padStart(2, "0")}`,
    positionTitle: [
      "Analis Kepegawaian Uji",
      "Pranata Operasional Uji",
      "Pengelola Dokumen Uji",
    ][i % 3],
    workUnit: [
      "Unit Administrasi Uji",
      "Unit Operasional Uji",
      "Unit Dukungan Uji",
    ][i % 3],
    isActive: i % 4 !== 3,
    directSupervisorId: null,
    employmentStartDate: null,
  }));
}
async function routes(page, rows = fixture(), options = {}) {
  await page.route(/\/api\/admin\/employees\/[^/]+\/account$/, (route) => {
    const id = route.request().url().split("/").at(-2);
    if (options.accountError === id)
      return route.fulfill({ status: 500, json: { error: "Gagal memuat" } });
    const employee = rows.find((row) => row.id === id);
    return route.fulfill({
      json: {
        account:
          employee && Number(id.slice(-2)) % 3 !== 0
            ? {
                employeeId: id,
                username: employee.nip,
                role: "PEGAWAI",
                isActive: Number(id.slice(-2)) !== 4,
              }
            : null,
      },
    });
  });
  await page.route(/\/api\/admin\/employees$/, async (route) => {
    if (options.list) return options.list(route);
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      options.onCreate?.(payload);
      const employee = {
        ...payload,
        id: randomUUID(),
        isActive: true,
        directSupervisorId: null,
        employmentStartDate: null,
      };
      rows.push(employee);
      return route.fulfill({ status: 201, json: { employee } });
    }
    return route.fulfill({ json: { employees: rows } });
  });
}
async function scenario(name, token, work, options = {}) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  context.setDefaultTimeout(7000);
  try {
    await context.addCookies([
      { name: "si_cuti_session", value: token, url: baseURL },
    ]);
    const page = await context.newPage();
    await work(page, context);
    passed++;
    console.log(`PASS ${name}`);
  } finally {
    await context.close();
  }
}
async function open(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (await page.locator(".employee-directory").count()) {
    await page.waitForFunction(
      () =>
        document
          .querySelector(".directory-summary")
          ?.getAttribute("aria-busy") === "false",
    );
  }
}

async function snapshot(page, name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: `${screenshots}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
try {
  const admin = await actor("ADMIN_KEPEGAWAIAN");
  const employee = await actor("PEGAWAI");
  await scenario(
    "employee pagination resets on filter and clamps after data shrink",
    admin,
    async (page) => {
      const rows = Array.from({ length: 23 }, (_, i) => ({
        ...fixture()[i % 8],
        id: `page-${i}`,
        nip: `TEST-${i}`,
        fullName: `Pagination Uji ${i + 1}`,
      }));
      await routes(page, rows, { onCreate: () => rows.splice(0, 22) });
      await open(page);
      await page.locator(".employee-filter select").first().selectOption("all");
      assert.equal(await page.locator(".employee-table tbody tr").count(), 10);
      const paging = page.getByRole("navigation", {
        name: "Navigasi halaman daftar",
      });
      await paging.getByRole("button", { name: "Halaman berikutnya" }).click();
      await paging.getByRole("button", { name: "Halaman berikutnya" }).click();
      assert.equal(await page.locator(".employee-table tbody tr").count(), 3);
      assert.equal(
        await paging
          .getByRole("button", { name: "Halaman berikutnya" })
          .isDisabled(),
        true,
      );
      await page
        .getByPlaceholder("Cari nama, NIP, jabatan, atau unit kerja")
        .fill("Pagination Uji 23");
      assert.equal(await page.locator(".employee-table tbody tr").count(), 1);
      await paging.getByText("Halaman 1 / 1", { exact: true }).waitFor();
      await page
        .getByPlaceholder("Cari nama, NIP, jabatan, atau unit kerja")
        .fill("");
      await paging.getByText("Halaman 1 / 3", { exact: true }).waitFor();
      await snapshot(page, "admin-paginated");
      await paging.getByRole("button", { name: "Halaman berikutnya" }).click();
      await paging.getByRole("button", { name: "Halaman berikutnya" }).click();
      await page
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("NIP", { exact: true }).fill("PAGE-NEW");
      await dialog
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Pagination Baru");
      await dialog.getByLabel("Jabatan", { exact: true }).fill("Jabatan Uji");
      await dialog.getByLabel("Unit kerja", { exact: true }).fill("Unit Uji");
      await dialog
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      await dialog.waitFor({ state: "detached" });
      await paging.getByText("Halaman 1 / 1", { exact: true }).waitFor();
      assert.equal(await page.locator(".employee-table tbody tr").count(), 2);
    },
  );
  await scenario(
    "official assignment opens a floating form and preserves save payload",
    admin,
    async (page) => {
      const assignments = Array.from({ length: 12 }, (_, i) => ({
        id: `official-${i}`,
        fullName: `Pejabat Uji ${i + 1}`,
        nip: `OFF-${i}`,
        capacity: "DEFINITIVE",
        effectiveFrom: "2099-01-01",
        effectiveTo: null,
        sourceReference: null,
        notes: null,
      }));
      let payload;
      await page.route(
        "**/api/admin/leave-authorized-officials",
        async (route) => {
          if (route.request().method() === "POST") {
            payload = route.request().postDataJSON();
            return route.fulfill({ json: { assignment: assignments[0] } });
          }
          return route.fulfill({ json: { assignments } });
        },
      );
      await page.goto("/admin/pejabat-cuti");
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator(".employee-table tbody tr").count(), 10);
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByRole("button", { name: "Halaman berikutnya" }).click();
      assert.equal(await page.locator(".employee-table tbody tr").count(), 2);
      const trigger = page.getByRole("button", { name: "Tambah penugasan" });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Pejabat Pengujian Baru");
      await dialog.getByLabel("NIP", { exact: true }).fill("OFF-NEW");
      await dialog.getByLabel("Mulai berlaku").fill("2099-01-01");
      await snapshot(page, "admin-official-floating");
      await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal(payload.fullName, "Pejabat Pengujian Baru");
      assert.equal(payload.effectiveTo, null);
      await page.setViewportSize({ width: 390, height: 844 });
      await trigger.click();
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      await snapshot(page, "admin-official-mobile-floating");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
    },
  );
  await scenario(
    "balance pagination and floating import preserve explicit confirmation",
    admin,
    async (page) => {
      const balances = Array.from({ length: 14 }, (_, i) => ({
        employeeId: `balance-${i}`,
        nip: `BAL-${i}`,
        fullName: `Saldo Uji ${i + 1}`,
        readiness: "UNINITIALIZED",
        isInitialized: false,
        regularAvailableDays: 0,
        history: [],
        accounts: [],
      }));
      await page.route(/\/api\/admin\/annual-balances\?/, (route) =>
        route.fulfill({ json: { balances } }),
      );
      await page.goto("/admin/saldo-cuti");
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator(".balance-employee-row").count(), 10);
      await page.getByRole("button", { name: "Halaman berikutnya" }).click();
      assert.equal(await page.locator(".balance-employee-row").count(), 4);
      await page.getByPlaceholder("Cari nama atau NIP").fill("Saldo Uji 14");
      assert.equal(await page.locator(".balance-employee-row").count(), 1);
      await page.getByText("Halaman 1 / 1", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Import Saldo", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: /Impor Saldo Awal/ }).waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: /Konfirmasi dan Inisialisasi/ })
          .count(),
        0,
      );
      await snapshot(page, "admin-balance-import-floating");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    },
  );
  await scenario(
    "request pagination and nested review windows keep actions accessible",
    admin,
    async (page) => {
      const requests = Array.from({ length: 13 }, (_, i) => ({
        id: `request-${i}`,
        status: "SUBMITTED",
        employee: {
          fullName: `Pengajuan Uji ${i + 1}`,
          nip: `REQ-${i}`,
          positionTitle: "Jabatan Uji",
          workUnit: "Unit Uji",
        },
        currentRevisionNumber: 1,
        currentRevision: {
          id: `revision-${i}`,
          leaveType: "SICK",
          startDate: "2026-10-14",
          endDate: "2026-10-15",
          reason: "Alasan sintetis untuk pengujian",
          submittedAt: null,
        },
      }));
      await page.route("**/api/workflow/permission-types", (route) =>
        route.fulfill({ json: { permissionTypes: [] } }),
      );
      await page.route("**/api/workflow/leave**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/revisions"))
          return route.fulfill({ json: { revisions: [] } });
        if (path.endsWith("/history"))
          return route.fulfill({ json: { history: [] } });
        if (path.endsWith("/documents"))
          return route.fulfill({ json: { documents: [] } });
        return route.fulfill({ json: { requests } });
      });
      await routes(page);
      await open(page);
      await page
        .locator(".authenticated-sidebar")
        .getByRole("link", { name: "Pengajuan", exact: true })
        .click();
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator(".request-card").count(), 10);
      assert.equal(await page.locator(".request-detail").count(), 0);
      await page.getByRole("button", { name: "Halaman berikutnya" }).click();
      assert.equal(await page.locator(".request-card").count(), 3);
      await page.locator(".request-card").first().click();
      const detail = page.getByRole("dialog", {
        name: "Detail pengajuan",
        exact: true,
      });
      await detail
        .getByRole("button", { name: "Kembalikan", exact: true })
        .click();
      const review = page.locator("dialog").last();
      await review.getByRole("textbox").fill("Catatan pengujian");
      await snapshot(page, "admin-request-review-floating");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.querySelectorAll("dialog[open]").length === 1,
      );
      await detail
        .getByRole("button", { name: "Kembalikan", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await detail.waitFor({ state: "detached" });
    },
  );
  await scenario(
    "actual counts, search/filter/reset and readable identity",
    admin,
    async (page) => {
      await routes(page);
      await open(page);
      for (const [key, value] of [
        ["total", "8"],
        ["active", "6"],
        ["inactive", "2"],
        ["units", "3"],
      ])
        assert.equal(
          await page.locator(`.directory-stat--${key} strong`).textContent(),
          value,
        );
      assert.match(
        await page.locator(".employee-table tbody tr").first().textContent(),
        /Pegawai Uji 01.*DEMO-UI-001/,
      );
      await page
        .getByRole("searchbox", { name: "Cari pegawai" })
        .fill("pegawai uji 01");
      assert.equal(await page.locator(".employee-table tbody tr").count(), 1);
      await page
        .locator(".employee-filter select")
        .first()
        .selectOption("inactive");
      await page
        .getByText("Pegawai tidak ditemukan", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Reset pencarian" }).click();
      assert.equal(await page.locator(".employee-table tbody tr").count(), 6);
      await snapshot(page, "admin-desktop");
    },
  );
  await scenario(
    "existing detail/edit, create payload and success feedback",
    admin,
    async (page) => {
      let created;
      await routes(page, fixture(), {
        onCreate: (payload) => {
          created = payload;
        },
      });
      await open(page);
      await page
        .getByRole("button", {
          name: "Lihat detail Pegawai Uji 01",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "Pegawai Uji 01" }).waitFor();
      await snapshot(page, "admin-detail");
      await dialog.getByRole("button", { name: "Edit Pegawai" }).click();
      assert.equal(
        await dialog.getByLabel("NIP", { exact: true }).inputValue(),
        "DEMO-UI-001",
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await page
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      await dialog.getByLabel("NIP", { exact: true }).fill("DEMO-UI-009");
      await dialog
        .getByLabel("Nama lengkap", { exact: true })
        .fill("Pegawai Uji 09");
      await dialog.getByLabel("Jabatan", { exact: true }).fill("Jabatan Uji");
      await dialog
        .getByLabel("Unit kerja", { exact: true })
        .fill("Unit Pengujian");
      await snapshot(page, "admin-create");
      await dialog
        .getByRole("button", { name: "Tambah Pegawai", exact: true })
        .click();
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(
        () =>
          document.querySelector(".directory-stat--total strong")
            ?.textContent === "9",
      );
      assert.equal(created.nip, "DEMO-UI-009");
      assert.equal(created.fullName, "Pegawai Uji 09");
      assert.match(
        await page.locator(".employee-directory .feedback").textContent(),
        /berhasil/,
      );
    },
  );
  await scenario(
    "import remains explicit preview before commit",
    admin,
    async (page) => {
      let commits = 0;
      await routes(page);
      await page.route("**/api/admin/employees/import", (route) => {
        if (route.request().method() === "PUT") commits++;
        return route.fulfill({
          json: {
            preview: {
              totalRows: 1,
              validRows: 1,
              invalidRows: 0,
              rows: [],
              errors: [],
            },
          },
        });
      });
      await open(page);
      await page
        .getByRole("button", { name: "Impor Pegawai", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      assert.equal(
        await dialog
          .getByRole("button", { name: "Konfirmasi Impor Pegawai" })
          .isDisabled(),
        true,
      );
      await dialog.getByLabel("Pilih workbook").setInputFiles({
        name: "pegawai-ui.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("synthetic intercepted upload"),
      });
      await dialog.getByRole("button", { name: "Preview & Validasi" }).click();
      await page.waitForFunction(
        () =>
          !document.querySelector("dialog .panel-actions .primary-button")
            ?.disabled,
      );
      assert.equal(commits, 0);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    },
  );
  await scenario(
    "loading never fabricates zero counts",
    admin,
    async (page) => {
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await routes(page, fixture(), {
        list: async (route) => {
          await held;
          await route.fulfill({ json: { employees: fixture() } });
        },
      });
      await page.goto("/");
      await page.getByText("Memuat data pegawai…", { exact: true }).waitFor();
      assert.deepEqual(
        await page.locator(".directory-summary strong").allTextContents(),
        ["—", "—", "—", "—"],
      );
      release();
      await page.waitForFunction(
        () =>
          document.querySelector(".directory-stat--total strong")
            ?.textContent === "8",
      );
    },
  );
  await scenario(
    "session/API failures remain visible and retry recovers",
    admin,
    async (page) => {
      let fail = true;
      await routes(page, fixture(), {
        list: (route) =>
          route.fulfill(
            fail
              ? { status: 401, json: { error: "Autentikasi diperlukan." } }
              : { json: { employees: fixture() } },
          ),
      });
      await open(page);
      assert.match(
        await page.locator(".directory-load-error").textContent(),
        /Autentikasi diperlukan/,
      );
      assert.deepEqual(
        await page.locator(".directory-summary strong").allTextContents(),
        ["—", "—", "—", "—"],
      );
      assert.equal(
        await page.getByText("Belum ada data pegawai", { exact: true }).count(),
        0,
      );
      await snapshot(page, "admin-load-error");
      fail = false;
      await page
        .getByRole("button", { name: "Coba lagi", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".directory-stat--total strong")
            ?.textContent === "8",
      );
      assert.equal(await page.locator(".directory-load-error").count(), 0);
    },
  );
  await scenario(
    "empty result is distinct from account load failure",
    admin,
    async (page) => {
      await routes(page, []);
      await open(page);
      await page.getByText("Belum ada data pegawai", { exact: true }).waitFor();
      assert.equal(
        await page.locator(".directory-stat--total strong").textContent(),
        "0",
      );
      await page.unrouteAll();
      await routes(page, fixture(), { accountError: fixture()[0].id });
      await open(page);
      const row = page.locator(".employee-table tbody tr").first();
      assert.equal(
        await row.locator(".directory-account-error").textContent(),
        "Gagal memuat",
      );
    },
  );
  for (const [name, viewport] of [
    ["tablet", { width: 834, height: 1112 }],
    ["mobile", { width: 390, height: 844 }],
    ["small-mobile", { width: 320, height: 568 }],
  ]) {
    await scenario(
      `${name} responsive cards/table, menu keyboard and drawers`,
      admin,
      async (page) => {
        await routes(page);
        await open(page);
        await snapshot(page, `admin-${name}`);
        const bounds = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          wide: [
            ...document.querySelectorAll(
              ".authenticated-workspace, .authenticated-content, .employee-page, .employee-list-surface, .employee-table-wrap, .directory-summary, .employee-header-actions, .authenticated-topbar",
            ),
          ].map((element) => ({
            name: element.className,
            width: element.getBoundingClientRect().width,
            right: element.getBoundingClientRect().right,
            overflow: getComputedStyle(element).overflowX,
          })),
        }));
        if (bounds.document > bounds.viewport)
          console.log(name, JSON.stringify(bounds));
        assert.ok(bounds.document <= bounds.viewport);
        const menu = page.getByRole("button", { name: "Buka menu" });
        await menu.click();
        assert.equal(await menu.getAttribute("aria-expanded"), "true");
        assert.equal(
          await page
            .locator(".authenticated-sidebar nav a[aria-current='page']")
            .evaluate((element) => element === document.activeElement),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        assert.equal(
          await menu.evaluate((element) => element === document.activeElement),
          true,
        );
        await page
          .getByRole("button", {
            name: "Lihat detail Pegawai Uji 01",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const box = await dialog.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
      },
      { viewport },
    );
  }
  await scenario(
    "desktop resize closes a mobile drawer and restores scrolling",
    admin,
    async (page) => {
      await routes(page);
      await open(page);
      await page.getByRole("button", { name: "Buka menu" }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForFunction(
        () =>
          document
            .querySelector(".shell-menu-button")
            ?.getAttribute("aria-expanded") === "false",
      );
      assert.notEqual(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
    },
    { viewport: { width: 390, height: 844 } },
  );
  await scenario(
    "Pegawai has no admin styling or access",
    employee,
    async (page) => {
      await open(page);
      assert.equal(await page.locator(".admin-interface").count(), 0);
      assert.equal(await page.locator(".employee-directory").count(), 0);
      assert.equal(
        (await page.request.get("/api/admin/employees")).status(),
        403,
      );
    },
  );
  await scenario(
    "reduced motion disables admin transitions",
    admin,
    async (page) => {
      await routes(page);
      await open(page);
      assert.equal(
        await page
          .locator(".detail-button")
          .first()
          .evaluate((element) => getComputedStyle(element).transitionDuration),
        "0s",
      );
    },
    { reducedMotion: "reduce" },
  );
  console.log(`${passed} admin browser scenarios passed.`);
} finally {
  await browser.close();
  await database.query(
    'DELETE FROM "Session" WHERE "authenticationIdentityId"=ANY($1::uuid[])',
    [identities],
  );
  await database.query(
    'DELETE FROM "AuthenticationIdentity" WHERE id=ANY($1::uuid[])',
    [identities],
  );
  await database.query('DELETE FROM "User" WHERE id=ANY($1::uuid[])', [users]);
  await database.query('DELETE FROM "Employee" WHERE id=ANY($1::uuid[])', [
    employees,
  ]);
  await database.end();
}
