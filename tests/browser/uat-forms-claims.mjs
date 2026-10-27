// Real local production server + disposable PostgreSQL. No session/cookie injection.
// Run only with an empty local DB migrated by this task. Fault cases are explicitly intercepted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = require("esbuild"),
  { Pool } = require("pg"),
  { PDFDocument, StandardFonts, degrees, rgb } = require("pdf-lib");
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
const databaseURL = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(databaseURL.hostname));
assert.equal(databaseURL.pathname, "/si_cuti_browser");
const base = process.env.UAT_BASE_URL || "http://127.0.0.1:3200";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = resolve(process.env.UAT_ARTIFACTS || "work/uat");
await mkdir(out, { recursive: true });
await mkdir("work", { recursive: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });
assert.equal(
  Number((await db.query('SELECT count(*) FROM "Employee"')).rows[0].count),
  0,
  "Use fresh empty browser DB",
);
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
export default async function(password:string){const db=createDatabaseClient();try{
const employees=new EmployeeService(new PrismaEmployeeRepository(db)),accounts=new AccountAdministrationService(new PrismaAccountAdministrationRepository(db));
const result=[];for(const [nip,role] of [['UAT-ADMIN','ADMIN_KEPEGAWAIAN'],['UAT-PEGAWAI','PEGAWAI'],['UAT-LAIN','PEGAWAI']] as const){
const e=await employees.create({nip,fullName:role==='ADMIN_KEPEGAWAIAN'?'Admin Pencatat Sintetis':'Pegawai Sintetis '+nip,positionTitle:'Penguji Administrasi',workUnit:'Unit Pengujian Sintetis',employmentStartDate:'2020-01-01'});
await accounts.provision(e.id,{role,password});result.push(e);}return result;
}finally{await db.$disconnect()}}`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "work/uat-bootstrap.mjs",
  logLevel: "error",
});
const [admin, owner, other] = await (
  await import(pathToFileURL(resolve("work/uat-bootstrap.mjs")))
).default(password);
const year = Number(
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date()),
);
for (const bucket of ["N", "N1", "N2", "JOINT_LEAVE_CLAIM"])
  await db.query(
    'INSERT INTO "AnnualBalanceAccount" (id,"employeeId","entitlementYear",bucket,"grantedDays","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [randomUUID(), owner.id, year, bucket, bucket === "N" ? 12 : 0],
  );
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
browser.on("disconnected", () => {});
const contexts = [];
const checks = [];
const record = checks.push.bind(checks);
checks.push = (message) => {
  console.log(message);
  return record(message);
};
async function login(actor) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(base);
  await page.locator("input[name=nip]").fill(actor.nip);
  await page.locator("input[type=password]").fill(password);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/auth/login") && r.status() === 200,
    ),
    page.getByRole("button", { name: "Masuk", exact: true }).click(),
  ]);
  await page.waitForTimeout(500);
  return { ctx, page, api: ctx.request };
}
async function json(api, path, data, status = 200) {
  const response =
    data === undefined
      ? await api.get(base + path)
      : await api.post(base + path, { data });
  assert.equal(response.status(), status, `${path}: ${await response.text()}`);
  return response.json();
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
async function overflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page overflow",
  );
}
async function openNew(page, kind) {
  await page.goto(`${base}/pengajuan?kind=${kind}&new=1`);
  await page
    .getByLabel(kind === "leave" ? "Jenis cuti" : "Jenis izin", { exact: true })
    .waitFor();
}
try {
  const a = await login(admin),
    p = await login(owner),
    o = await login(other);
  assert.equal((await json(p.api, "/api/joint-leave?year=" + year)).total, 0);
  assert.deepEqual(
    (await json(p.api, "/api/workflow/permission-types")).permissionTypes,
    [],
  );
  await p.page.setViewportSize({ width: 390, height: 844 });
  await openNew(p.page, "permission");
  await p.page
    .getByText("Belum ada jenis izin aktif.", { exact: false })
    .waitFor();
  assert.ok(
    await p.page.getByLabel("Jenis izin", { exact: true }).isDisabled(),
  );
  await shot(p.page, "permission-empty-mobile");
  await overflow(p.page);
  checks.push(
    "Real DB: empty active permission types, explanatory message and disabled select",
  );
  const type = randomUUID();
  await db.query(
    "INSERT INTO \"PermissionType\" (id,code,name,description,\"updatedAt\") VALUES ($1,'UAT_ONLY','Izin Simulasi UAT','Fixture sintetis, bukan kebijakan resmi',NOW())",
    [type],
  );
  for (const width of [1440, 390]) {
    await p.page.setViewportSize({ width, height: 900 });
    await openNew(p.page, "permission");
    await p.page.getByLabel("Jenis izin", { exact: true }).selectOption(type);
    assert.equal(
      await p.page.getByLabel("Jenis izin", { exact: true }).inputValue(),
      type,
    );
    await overflow(p.page);
    await shot(p.page, "permission-active-" + width);
  }
  await p.page.locator("[name=startDate]").fill(`${year}-11-09`);
  await p.page.locator("[name=endDate]").fill(`${year}-11-09`);
  await p.page.locator("[name=reason]").fill("Izin simulasi sintetis");
  await p.page
    .getByRole("button", { name: "Simpan draf", exact: false })
    .click();
  await p.page
    .getByText("Draf pengajuan tersimpan.", { exact: false })
    .waitFor();
  checks.push("Real UI: active permission selected and draft saved on mobile");
  // Explicit fault interception, while retaining a genuine authenticated session.
  for (const mode of ["loading", "error", "network"]) {
    let release;
    const gate = new Promise((r) => (release = r));
    await p.page.route("**/api/workflow/permission-types", async (route) => {
      if (mode === "loading") {
        await gate;
        await route.continue().catch(() => {});
      } else if (mode === "error")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"Simulasi API gagal"}',
        });
      else await route.abort("failed");
    });
    await openNew(p.page, "permission");
    await p.page
      .getByText(
        mode === "loading"
          ? "Memuat jenis izin…"
          : "Jenis izin gagal dimuat. Coba lagi sebelum menyimpan.",
        { exact: false },
      )
      .last()
      .waitFor();
    await shot(p.page, "permission-" + mode);
    release();
    if (mode === "loading")
      await p.page
        .getByLabel("Jenis izin", { exact: true })
        .waitFor({ state: "visible" });
    await p.page.unroute("**/api/workflow/permission-types");
    checks.push("INTERCEPTED " + mode + ": distinct permission state");
  }
  const policyInput = {
    name: "SIMULASI UAT - bukan kebijakan resmi",
    creditYear: year,
    quotaDays: 5,
    sourceReference:
      "Fixture lokal sintetis; bukan sumber eligibility operasional",
    events: [12, 13, 14, 15].map((day) => ({
      date: `${year}-10-${day}`,
      name: `Tanggal simulasi ${day}`,
      kind: "REGULAR",
    })),
  };
  let r = await a.api.post(base + "/api/joint-leave/policies", {
    headers: { "idempotency-key": randomUUID() },
    data: policyInput,
  });
  assert.equal(r.status(), 200, await r.text());
  const policy = (await r.json()).policy;
  assert.equal(
    (
      await p.api.post(base + "/api/joint-leave/policies", {
        data: policyInput,
      })
    ).status(),
    403,
  );
  await p.page.goto(base + "/klaim-cuti-bersama");
  await p.page
    .getByRole("button", { name: "Ajukan Klaim", exact: false })
    .click();
  await p.page
    .getByLabel("Jenis penugasan", { exact: false })
    .selectOption("SPRIN_ASSIGNMENT");
  assert.equal(
    await p.page.getByLabel("Jenis penugasan", { exact: false }).inputValue(),
    "SPRIN_ASSIGNMENT",
  );
  await shot(p.page, "sprin-form-mobile");
  const evidenceDoc = await PDFDocument.create();
  evidenceDoc
    .addPage()
    .drawText("BUKTI PENUGASAN SINTETIS - BUKAN DOKUMEN RESMI");
  const evidence = Buffer.from(await evidenceDoc.save());
  const kinds = [
    "SPRIN_ASSIGNMENT",
    "SPECIAL_STANDBY",
    "OPERATIONS",
    "REGULAR_STANDBY",
  ];
  for (const [i, assignmentType] of kinds.entries()) {
    const input = {
      policyId: policy.id,
      eventIds: [policy.eventDates[i].id],
      assignmentType,
      title: "Penugasan sintetis " + assignmentType,
      sprinNumber: i === 0 ? null : "SPRIN/UAT/" + i,
      idempotencyKey: randomUUID(),
    };
    async function submit(data) {
      return p.api.post(base + "/api/joint-leave", {
        multipart: {
          data: JSON.stringify(data),
          evidence: {
            name: "bukti.pdf",
            mimeType: "application/pdf",
            buffer: evidence,
          },
        },
      });
    }
    r = await submit(input);
    assert.equal(r.status(), 200, await r.text());
    const claim = (await r.json()).claim;
    assert.equal(
      (await submit({ ...input, idempotencyKey: randomUUID() })).status(),
      409,
    );
    assert.equal(
      (
        await o.api.get(base + `/api/joint-leave/${claim.id}/evidence`)
      ).status(),
      404,
    );
    assert.equal(
      (
        await p.api.get(base + `/api/joint-leave/${claim.id}/evidence`)
      ).status(),
      200,
    );
    const review = {
      approvedEventIds: input.eventIds,
      reason: "Bukti simulasi diperiksa Admin",
      evidenceVerified: true,
      idempotencyKey: randomUUID(),
      fingerprint: "",
    };
    assert.equal(
      (
        await p.api.post(base + `/api/joint-leave/${claim.id}/preview`, {
          data: review,
        })
      ).status(),
      403,
    );
    const preview = await json(
      a.api,
      `/api/joint-leave/${claim.id}/preview`,
      review,
    );
    review.fingerprint = preview.preview.fingerprint;
    const approved = (
      await json(a.api, `/api/joint-leave/${claim.id}/review`, review)
    ).claim;
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.assignmentType, assignmentType);
    assert.equal(
      (await json(p.api, `/api/joint-leave/${claim.id}`)).claim.assignmentType,
      assignmentType,
    );
  }
  checks.push(
    "Real API/DB: policy configuration, all four types, optional/independent number, evidence, duplicate409, preview/approval/history, RBAC",
  );
  await p.page.goto(base + "/klaim-cuti-bersama");
  await p.page.getByText("Sprin Penugasan", { exact: false }).first().waitFor();
  await shot(p.page, "sprin-history-mobile");
  // Actual application-generated form, then synthetic signed-scan fixture (no forged signature).
  const leaveData = {
    leaveType: "SICK",
    startDate: `${year}-11-09`,
    endDate: `${year}-11-10`,
    reason: "Keperluan pemeriksaan kesehatan sintetis",
    formPlace: "Gunungsitoli",
    leaveAddress: "Jalan Pengujian Nomor 1, Unit Simulasi",
    leavePhone: "+628000000000",
  };
  const leave = (await json(p.api, "/api/workflow/leave", leaveData, 201))
    .request;
  await json(p.api, `/api/workflow/leave/${leave.id}/actions`, {
    action: "SUBMIT",
    idempotencyKey: randomUUID(),
  });
  r = await p.api.get(base + `/api/workflow/leave/${leave.id}/document`);
  assert.equal(r.status(), 200);
  const form = await r.body();
  await writeFile(out + "/form-normal.pdf", form);
  for (const width of [1440, 390, 320]) {
    await p.page.setViewportSize({ width, height: 1000 });
    await openNew(p.page, "leave");
    await p.page
      .locator("[name=leaveAddress]")
      .fill("Alamat sintetis sangat panjang ".repeat(50));
    await p.page
      .locator("[name=reason]")
      .fill("Alasan sintetis panjang ".repeat(50));
    await overflow(p.page);
    const bounds = await p.page
      .locator("[name=startDate], [name=endDate]")
      .evaluateAll((xs) =>
        xs.map((x) => ({
          x: x.getBoundingClientRect().x,
          right: x.getBoundingClientRect().right,
          width: innerWidth,
        })),
      );
    assert.ok(bounds.every((b) => b.x >= 0 && b.right <= b.width));
    await shot(p.page, "leave-form-" + width);
  }
  const long = (
    await json(
      p.api,
      "/api/workflow/leave",
      {
        ...leaveData,
        formPlace: "Tempat pengujian panjang ".repeat(4),
        reason: "ALASAN SINTETIS ".repeat(500) + "AKHIRALASAN",
        leaveAddress: "ALAMAT SINTETIS ".repeat(500) + "AKHIRALAMAT",
      },
      201,
    )
  ).request;
  await json(p.api, `/api/workflow/leave/${long.id}/actions`, {
    action: "SUBMIT",
    idempotencyKey: randomUUID(),
  });
  r = await p.api.get(base + `/api/workflow/leave/${long.id}/document`);
  assert.equal(r.status(), 200);
  await writeFile(out + "/form-long.pdf", await r.body());
  async function scan(version) {
    const pdf = await PDFDocument.load(form);
    const f = await pdf.embedFont(StandardFonts.Helvetica);
    pdf
      .getPage(0)
      .drawText("SCAN SIMULASI V" + version + " - TANPA TANDA TANGAN ASLI", {
        x: 40,
        y: 830,
        size: 8,
        font: f,
        color: rgb(0.5, 0, 0),
      });
    const landscape = pdf.addPage([842, 595]);
    landscape.setCropBox(20, 20, 800, 550);
    landscape.setRotation(degrees(90));
    landscape.drawText("HALAMAN LAMPIRAN SIMULASI - V" + version, {
      x: 50,
      y: 500,
      size: 12,
      font: f,
    });
    return Buffer.from(await pdf.save());
  }
  const scans = [await scan(1), await scan(2)],
    documents = [];
  for (const [i, buffer] of scans.entries()) {
    r = await p.api.post(base + `/api/workflow/leave/${leave.id}/documents`, {
      multipart: {
        file: {
          name: "scan-v" + (i + 1) + ".pdf",
          mimeType: "application/pdf",
          buffer,
        },
      },
    });
    assert.equal(r.status(), 201, await r.text());
    documents.push((await r.json()).document);
  }
  // Explicitly pin version 1 although version 2 is newer.
  await json(a.api, `/api/workflow/leave/${leave.id}/actions`, {
    action: "APPROVE",
    evidenceReference: "DASAR UAT SINTETIS",
    documentId: documents[0].id,
    idempotencyKey: randomUUID(),
  });
  const decision = (
    await json(a.api, `/api/workflow/leave/${leave.id}/decision`)
  ).decision;
  assert.equal(decision.snapshot.sourceDocumentVersion, 1);
  const meta = await json(
    a.api,
    `/api/workflow/leave/${leave.id}/decision/editions/preview`,
  );
  assert.equal(meta.pages.length, 2);
  assert.equal(meta.pages[1].rotation, 90);
  assert.equal(
    (
      await p.api.get(
        base + `/api/workflow/leave/${leave.id}/decision/editions/preview`,
      )
    ).status(),
    403,
  );
  const checksum = decision.snapshot.sourceChecksumSha256;
  for (const [index, placement] of [
    { page: 1, left: 0.06, top: 0.768, width: 0.5, height: 0.065 },
    { page: 2, left: 0.1, top: 0.1, width: 0.5, height: 0.18 },
  ].entries()) {
    const payload = { placement, sourceChecksum: checksum };
    r = await a.api.post(
      base + `/api/workflow/leave/${leave.id}/decision/editions/preview`,
      { data: payload },
    );
    assert.equal(r.status(), 200, await r.text());
    await writeFile(out + `/decision-preview-${index + 1}.pdf`, await r.body());
    const save = {
      ...payload,
      confirmed: true,
      previewFingerprint: r.headers()["x-si-cuti-preview"],
      idempotencyKey: randomUUID(),
    };
    const saved = await json(
      a.api,
      `/api/workflow/leave/${leave.id}/decision/editions`,
      save,
      201,
    );
    assert.deepEqual(
      await json(
        a.api,
        `/api/workflow/leave/${leave.id}/decision/editions`,
        save,
        201,
      ),
      saved,
    );
    assert.equal(
      (
        await p.api.post(
          base + `/api/workflow/leave/${leave.id}/decision/editions`,
          { data: save },
        )
      ).status(),
      403,
    );
  }
  r = await p.api.get(
    base + `/api/workflow/leave/${leave.id}/documents/${documents[0].id}`,
  );
  assert.equal(
    createHash("sha256")
      .update(await r.body())
      .digest("hex"),
    createHash("sha256").update(scans[0]).digest("hex"),
  );
  const final = (await json(a.api, `/api/workflow/leave/${leave.id}/decision`))
    .decision;
  assert.equal(final.editions.length, 2);
  for (const edition of final.editions) {
    r = await p.api.get(
      base +
        `/api/workflow/leave/${leave.id}/decision/document?edition=${edition.id}`,
    );
    assert.equal(r.status(), 200);
    await writeFile(
      out + `/decision-edition-${edition.version}.pdf`,
      await r.body(),
    );
    assert.equal(
      (
        await o.api.get(
          base +
            `/api/workflow/leave/${leave.id}/decision/document?edition=${edition.id}`,
        )
      ).status(),
      403,
    );
  }
  await writeFile(out + "/scan-original-v1.pdf", scans[0]);
  checks.push(
    "Real API/DB: two scan versions, approval pinned V1, source checksum unchanged, multipage/crop/rotation metadata, marked preview/save/replay, old editions and owner/foreign RBAC",
  );
  for (const width of [1440, 390]) {
    await a.page.setViewportSize({ width, height: 1000 });
    await a.page.goto(`${base}/pengajuan?request=${leave.id}`);
    await a.page
      .getByRole("button", { name: "Atur Penanda pada Formulir", exact: true })
      .click();
    const editor = a.page.getByRole("dialog", {
      name: "Penanda Keputusan pada Formulir",
      exact: true,
    });
    await editor.getByLabel("Halaman scan").selectOption("2");
    await editor
      .getByRole("button", { name: "Lihat Preview PDF", exact: true })
      .click();
    await editor
      .getByRole("link", { name: "Buka preview di tab baru", exact: true })
      .waitFor();
    await editor.getByRole("checkbox").check();
    if (width === 390)
      await editor
        .getByLabel("Perbesaran Preview penanda keputusan")
        .selectOption("3");
    await editor.getByRole("checkbox").scrollIntoViewIfNeeded();
    await shot(a.page, "marker-preview-" + width);
    assert.ok(
      await editor
        .getByRole("button", { name: "Simpan Edisi Final", exact: true })
        .isEnabled(),
    );
    if (width === 390) {
      await editor
        .getByRole("button", { name: "Simpan Edisi Final", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
    } else await a.page.keyboard.press("Escape");
  }
  checks.push(
    "Real Admin UI: pinned source/page selection, preview and confirmed new edition on mobile; desktop preview",
  );
  const rejected = (await json(p.api, "/api/workflow/leave", leaveData, 201))
    .request;
  await json(p.api, `/api/workflow/leave/${rejected.id}/actions`, {
    action: "SUBMIT",
    idempotencyKey: randomUUID(),
  });
  r = await p.api.post(base + `/api/workflow/leave/${rejected.id}/documents`, {
    multipart: {
      file: {
        name: "scan-reject.pdf",
        mimeType: "application/pdf",
        buffer: scans[0],
      },
    },
  });
  assert.equal(r.status(), 201);
  const rejectSource = (await r.json()).document;
  await json(a.api, `/api/workflow/leave/${rejected.id}/actions`, {
    action: "REJECT",
    reason: "Alasan penolakan sintetis untuk pemeriksaan UAT",
    documentId: rejectSource.id,
    idempotencyKey: randomUUID(),
  });
  const rd = (await json(a.api, `/api/workflow/leave/${rejected.id}/decision`))
    .decision;
  r = await a.api.post(
    base + `/api/workflow/leave/${rejected.id}/decision/editions/preview`,
    {
      data: {
        placement: {
          page: 1,
          left: 0.06,
          top: 0.884,
          width: 0.5,
          height: 0.086,
        },
        sourceChecksum: rd.snapshot.sourceChecksumSha256,
      },
    },
  );
  assert.equal(r.status(), 200, await r.text());
  await writeFile(out + "/decision-rejected-preview.pdf", await r.body());
  checks.push(
    "Real API/DB: rejection with pinned scan and actual marked rejection PDF",
  );
  checks.push(
    "Actual PDFs saved for visual inspection; synthetic scan has no fabricated signature",
  );
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        checks,
        year,
        source: "origin/staging e5c1818305e8f50c74bd2fea7e5cb61536a87b09",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
  await db.end();
}
