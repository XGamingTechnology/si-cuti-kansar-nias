// Actual opaque sessions / API / disposable PostgreSQL. Failure/race interpositions are labelled MOCK.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright"),
  { Pool } = require("pg"),
  sharp = require("sharp");
assert.equal(process.env.SI_CUTI_DISPOSABLE_TEST_DB, "1");
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL = process.env.SI_CUTI_AVATAR_TEST_URL || "http://127.0.0.1:3199",
  out = process.env.SI_CUTI_AVATAR_ARTIFACTS || "/workspace/scratch/avatar";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let passed = 0;
async function actor(role) {
  const employee = randomUUID(),
    user = randomUUID(),
    identity = randomUUID(),
    token = randomBytes(32).toString("hex"),
    name = `${role === "PEGAWAI" ? "Pegawai" : "Admin"} Avatar Sintetis`;
  await db.query(
    'INSERT INTO "Employee"(id,nip,"fullName","positionTitle","workUnit","updatedAt") VALUES($1,$2,$3,\'Penguji\',\'Unit Avatar Sintetis\',NOW())',
    [employee, `AV-${employee.slice(0, 26)}`, name],
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
  return { employee, user, token, name };
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
    console.log(`PASS ${name}`);
    passed++;
  } catch (e) {
    await page.screenshot({ path: `${out}/failure.png` });
    throw e;
  } finally {
    await ctx.close();
  }
}
async function profile(page) {
  await page.goto("/profil");
  await page
    .getByRole("heading", { name: "Profil Pegawai", exact: true })
    .waitFor();
  await page
    .getByText("Memuat foto…", { exact: true })
    .waitFor({ state: "hidden" });
}
async function choose(page, bytes, mime = "image/png") {
  await page
    .getByLabel("Pilih foto profil", { exact: true })
    .setInputFiles({ name: "synthetic.png", mimeType: mime, buffer: bytes });
}
async function photoSlots(page, v) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll(".account-avatar img")].length === 3 &&
      [...document.querySelectorAll(".account-avatar img")].every(
        (i) =>
          i.getAttribute("src") === `/api/me/avatar/image?v=${expected}` &&
          i.complete &&
          i.naturalWidth > 0,
      ),
    v,
  );
}
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
}
async function mutate(ctx, bytes, version, key = randomUUID()) {
  return ctx.request.put("/api/me/avatar", {
    headers: {
      "content-type": "image/png",
      "if-match": `"${version}"`,
      "idempotency-key": key,
    },
    data: bytes,
  });
}
try {
  const a = await actor("PEGAWAI"),
    b = await actor("PEGAWAI"),
    admin = await actor("ADMIN_KEPEGAWAIAN"),
    c = await actor("PEGAWAI");
  const image = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#e5b751" },
    })
      .png()
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { ImageDescription: "PRIVATE_EXIF" } },
      })
      .toBuffer(),
    other = await sharp({
      create: { width: 500, height: 500, channels: 3, background: "#247096" },
    })
      .png()
      .toBuffer();
  await scenario(
    "DB: Pegawai local preview until Save, normalized private photo and live three-slot refresh",
    a,
    async (page, ctx) => {
      await profile(page);
      assert.equal(await page.locator(".account-avatar img").count(), 0);
      await choose(page, image);
      await page
        .getByAltText("Pratinjau foto pilihan, belum disimpan")
        .waitFor();
      assert.equal(
        (await (await ctx.request.get("/api/me/avatar")).json()).version,
        0,
      );
      let writes = 0;
      page.on("request", (r) => {
        if (r.method() === "PUT" && r.url().endsWith("/api/me/avatar"))
          writes++;
      });
      await page
        .getByRole("button", { name: "Simpan foto", exact: true })
        .evaluate((e) => {
          e.click();
          e.click();
        });
      await page.getByText("Foto profil tersimpan.", { exact: true }).waitFor();
      assert.equal(writes, 1);
      await photoSlots(page, 1);
      const meta = await (await ctx.request.get("/api/me/avatar")).json();
      assert.ok(
        !JSON.stringify(meta).match(/storageKey|userId|employeeId|checksum/),
      );
      const r = await ctx.request.get(meta.imageUrl);
      assert.ok(r.headers()["cache-control"].includes("no-store"));
      const m = await sharp(await r.body()).metadata();
      assert.equal(Math.max(m.width, m.height), 512);
      assert.equal(m.exif, undefined);
      assert.equal(m.orientation, undefined);
      assert.ok(!String(await r.body()).includes("PRIVATE_EXIF"));
      await shot(page, "employee-profile-desktop");
    },
  );
  await scenario(
    "DB: B/Admin cannot address A, authority and anonymous/traversal rejected",
    b,
    async (page, ctx) => {
      assert.equal(
        (await ctx.request.get("/api/me/avatar/image?v=1")).status(),
        404,
      );
      for (const suffix of [
        `?employeeId=${a.employee}`,
        `?userId=${a.user}`,
        "?path=../../etc/passwd",
      ]) {
        assert.equal(
          (await ctx.request.get(`/api/me/avatar${suffix}`)).status(),
          422,
        );
        assert.equal(
          (
            await ctx.request.put(`/api/me/avatar${suffix}`, {
              headers: {
                "content-type": "image/png",
                "if-match": '"0"',
                "idempotency-key": randomUUID(),
              },
              data: other,
            })
          ).status(),
          422,
        );
      }
      assert.equal(
        (
          await ctx.request.get("/api/me/avatar/image?v=1&userId=" + a.user)
        ).status(),
        422,
      );
      assert.equal(
        (await ctx.request.get("/api/me/avatar/image/" + a.user)).status(),
        404,
      );
      assert.equal((await mutate(ctx, other, 0)).status(), 200);
      const own = await (
        await ctx.request.get("/api/me/avatar/image?v=1")
      ).body();
      assert.notEqual(
        createHash("sha256").update(own).digest("hex"),
        (
          await db.query(
            'SELECT checksum FROM "UserAvatar" WHERE "userId"=$1',
            [a.user],
          )
        ).rows[0].checksum,
      );
      const unknown = await browser.newContext({ baseURL });
      for (const method of ["get", "put", "delete"]) {
        const response = await unknown.request[method]("/api/me/avatar", {
          data: method === "put" ? other : undefined,
        });
        assert.equal(response.status(), 401);
      }
      await unknown.close();
    },
  );
  await scenario(
    "DB: Admin own replace/delete, explicit confirmation, mobile Escape/focus and cache invalidation",
    admin,
    async (page, ctx) => {
      assert.equal(
        (await ctx.request.get("/api/me/avatar/image?v=1")).status(),
        404,
      );
      assert.equal(
        (await ctx.request.get(`/api/me/avatar?userId=${a.user}`)).status(),
        422,
      );
      assert.equal((await mutate(ctx, other, 0)).status(), 200);
      await profile(page);
      await photoSlots(page, 1);
      await choose(page, image);
      await page
        .getByRole("button", { name: "Simpan foto", exact: true })
        .click();
      await page.getByText("Foto profil tersimpan.", { exact: true }).waitFor();
      await photoSlots(page, 2);
      await shot(page, "admin-profile-mobile");
      await page
        .getByRole("button", { name: "Hapus foto", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Hapus foto profil?",
        exact: true,
      });
      await dialog.waitFor();
      assert.equal(
        (await (await ctx.request.get("/api/me/avatar")).json()).version,
        2,
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("button", { name: "Hapus foto", exact: true })
          .evaluate((e) => document.activeElement === e),
        true,
      );
      await page
        .getByRole("button", { name: "Hapus foto", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Ya, hapus foto", exact: true })
        .click();
      await page
        .getByText("Foto profil dihapus. Inisial digunakan.", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".account-avatar img").count(), 0);
      assert.equal(
        (await ctx.request.get("/api/me/avatar/image?v=2")).status(),
        404,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
    },
  );
  await scenario(
    "DB: decoder rejects corrupt replacement and old photo stays valid",
    a,
    async (page, ctx) => {
      await profile(page);
      await photoSlots(page, 1);
      await choose(page, Buffer.from("not a png"));
      await page
        .getByRole("button", { name: "Simpan foto", exact: true })
        .click();
      await page.getByText(/Gambar tidak valid, rusak/).waitFor();
      assert.equal(
        (await (await ctx.request.get("/api/me/avatar")).json()).version,
        1,
      );
      assert.equal(
        (await ctx.request.get("/api/me/avatar/image?v=1")).status(),
        200,
      );
      await photoSlots(page, 1);
    },
  );
  await scenario(
    "DB: concurrent CAS has one winner and retry one durable operation",
    c,
    async (page, ctx) => {
      const key = randomUUID(),
        responses = await Promise.all([
          mutate(ctx, image, 0, key),
          mutate(ctx, other, 0),
        ]);
      assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 409]);
      const winner =
        responses[0].status() === 200
          ? { bytes: image, key }
          : { bytes: other, key: null };
      if (winner.key)
        assert.equal(
          (await mutate(ctx, winner.bytes, 0, winner.key)).status(),
          200,
        );
      assert.equal(
        (
          await db.query(
            'SELECT id FROM "AvatarOperation" WHERE "actorUserId"=$1',
            [c.user],
          )
        ).rows.length,
        1,
      );
    },
  );
  await scenario(
    "MOCK image failure: initials fallback and explicit reload restores all slots",
    a,
    async (page) => {
      await page.route("**/api/me/avatar/image?*", (r) =>
        r.fulfill({ status: 503, body: "unavailable" }),
      );
      await profile(page);
      await page.waitForFunction(
        () => document.querySelectorAll(".account-avatar img").length === 0,
      );
      assert.ok((await page.locator(".top-avatar").innerText()).includes("PA"));
      await page.unroute("**/api/me/avatar/image?*");
      await page
        .getByRole("button", { name: "Muat ulang foto", exact: true })
        .click();
      await photoSlots(page, 1);
    },
  );
  await scenario(
    "MOCK lost response after real commit: same-key retry preserves a newer photo without duplicate audit",
    a,
    async (page, ctx) => {
      await profile(page);
      let count = 0;
      const keys = [];
      await page.route("**/api/me/avatar", async (r) => {
        if (r.request().method() !== "PUT") return r.continue();
        keys.push(r.request().headers()["idempotency-key"]);
        if (++count === 1) {
          await r.fetch();
          return r.abort("failed");
        }
        return r.continue();
      });
      await choose(page, other);
      await page
        .getByRole("button", { name: "Simpan foto", exact: true })
        .click();
      await page.getByText(/Koneksi terputus/).waitFor();
      assert.equal(
        (await (await ctx.request.get("/api/me/avatar")).json()).version,
        2,
      );
      assert.equal((await mutate(ctx, image, 2)).status(), 200);
      await page
        .getByRole("button", {
          name: "Coba lagi permintaan yang sama",
          exact: true,
        })
        .click();
      await page
        .getByText(
          "Permintaan sebelumnya sudah diproses. Foto terbaru dimuat; perubahan yang lebih baru dipertahankan.",
          { exact: true },
        )
        .waitFor();
      await photoSlots(page, 3);
      assert.equal(keys[0], keys[1]);
      assert.equal(
        (
          await db.query(
            'SELECT id FROM "AvatarOperation" WHERE "actorUserId"=$1',
            [a.user],
          )
        ).rows.length,
        3,
      );
    },
  );
  await scenario(
    "MOCK metadata loading/error/retry does not erase photo; late response respects current version",
    a,
    async (page) => {
      let resolve;
      const held = new Promise((r) => (resolve = r));
      await page.route("**/api/me/avatar", async (r) => {
        await held;
        return r.fulfill({ status: 503, json: { error: "unavailable" } });
      });
      await page.goto("/profil");
      await page.getByText("Memuat foto…", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Simpan foto", exact: true })
          .isDisabled(),
        true,
      );
      resolve();
      await page
        .getByText("Foto profil belum dapat dimuat. Coba lagi.", {
          exact: true,
        })
        .waitFor();
      await page.unroute("**/api/me/avatar");
      await page
        .getByRole("button", { name: "Muat ulang foto", exact: true })
        .click();
      await photoSlots(page, 3);
    },
  );
  console.log(
    `${passed} avatar browser scenarios passed: 5 real session/API/DB + 3 MOCK failure/uncertain-response/metadata. No real employee photos.`,
  );
} finally {
  await browser.close();
  await db.end();
}
