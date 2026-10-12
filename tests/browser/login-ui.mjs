import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

// Browser tooling is installed separately; no application dependency is added.
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.SI_CUTI_PLAYWRIGHT_MODULE || "playwright",
);
const baseURL = process.env.SI_CUTI_LOGIN_TEST_URL || "http://127.0.0.1:3100";
const screenshots = process.env.SI_CUTI_LOGIN_SCREENSHOTS;
const browser = await chromium.launch({
  ...(process.env.SI_CUTI_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.SI_CUTI_CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox"],
});
let passed = 0;
async function scenario(name, work, options = {}) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    ...options,
  });
  try {
    context.setDefaultTimeout(7000);
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
  await page.locator("#sign-in-nip").waitFor();
}
async function credentials(page) {
  await page.getByLabel("NIP", { exact: true }).fill("TEST-LOGIN");
  await page.getByLabel("Kata sandi", { exact: true }).fill("Uji-Login-123!");
}
async function snapshot(page, name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: `${screenshots}/${name}.png`,
    fullPage: true,
    animations: "disabled",
    animations: "disabled",
  });
}
try {
  await scenario(
    "password visibility, keyboard/pointer focus, values and autocomplete",
    async (page) => {
      let requests = 0;
      await page.route("**/api/auth/login", () => {
        requests++;
      });
      await open(page);
      await credentials(page);
      const password = page.getByLabel("Kata sandi", { exact: true });
      assert.equal(await password.getAttribute("type"), "password");
      assert.equal(
        await password.getAttribute("autocomplete"),
        "current-password",
      );
      assert.equal(
        await page
          .getByLabel("NIP", { exact: true })
          .getAttribute("autocomplete"),
        "username",
      );
      assert.equal(
        await page.getByLabel("NIP", { exact: true }).getAttribute("maxlength"),
        "32",
      );
      await password.evaluate((element) => {
        element.dataset.originalNode = "yes";
      });
      await password.focus();
      await page.getByRole("button", { name: "Tampilkan kata sandi" }).click();
      assert.equal(await password.getAttribute("type"), "text");
      assert.equal(await password.inputValue(), "Uji-Login-123!");
      assert.equal(await password.getAttribute("data-original-node"), "yes");
      assert.equal(
        await password.evaluate(
          (element) => element === document.activeElement,
        ),
        true,
      );
      const hide = page.getByRole("button", { name: "Sembunyikan kata sandi" });
      assert.equal(await hide.getAttribute("aria-pressed"), "true");
      await hide.click();
      assert.equal(await password.getAttribute("type"), "password");
      await password.press("Tab");
      const show = page.getByRole("button", { name: "Tampilkan kata sandi" });
      assert.equal(
        await show.evaluate((element) => element === document.activeElement),
        true,
      );
      await show.press("Enter");
      assert.equal(await password.getAttribute("type"), "text");
      assert.equal(await password.inputValue(), "Uji-Login-123!");
      assert.equal(
        await page
          .getByRole("button", { name: "Sembunyikan kata sandi" })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      assert.equal(requests, 0);
    },
  );

  await scenario(
    "generic invalid-login floating alert and dismissal",
    async (page) => {
      await page.route("**/api/auth/login", (route) =>
        route.fulfill({
          status: 401,
          json: { error: "PRIVATE_BACKEND_DETAILS" },
        }),
      );
      await open(page);
      await credentials(page);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      const alert = page.locator(".sign-in-toast").getByRole("alert");
      await alert.waitFor();
      assert.match(
        await alert.textContent(),
        /NIP atau kata sandi tidak valid\./,
      );
      assert.equal(
        (await page.locator("body").textContent()).includes(
          "PRIVATE_BACKEND_DETAILS",
        ),
        false,
      );
      const box = await page.locator(".sign-in-toast").boundingBox();
      assert.ok(box.x > 900 && box.y < 30);
      assert.equal(
        await page
          .getByRole("button", { name: "Masuk", exact: true })
          .isEnabled(),
        true,
      );
      await snapshot(page, "desktop-error");
      await page.getByRole("button", { name: "Tutup notifikasi" }).click();
      await page.locator(".sign-in-toast").waitFor({ state: "detached" });
    },
  );

  await scenario(
    "expired-session warning from the existing server path",
    async (page, context) => {
      await context.addCookies([
        {
          name: "si_cuti_session",
          value: "expired-ui-test-token",
          url: baseURL,
        },
      ]);
      await open(page);
      const status = page.locator(".sign-in-toast").getByRole("status");
      assert.match(await status.textContent(), /Sesi telah berakhir/);
      assert.match(await status.textContent(), /Silakan masuk kembali/);
      await page.getByRole("button", { name: "Tutup notifikasi" }).click();
      await page.locator(".sign-in-toast").waitFor({ state: "detached" });
      assert.equal(
        await page
          .getByRole("button", { name: "Masuk", exact: true })
          .isEnabled(),
        true,
      );
    },
  );

  await scenario(
    "pending prevents duplicate submits and keeps CTA dimensions",
    async (page) => {
      let count = 0;
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route("**/api/auth/login", async (route) => {
        count++;
        await held;
        await route.fulfill({ status: 401, json: { error: "ignored" } });
      });
      await open(page);
      await credentials(page);
      const initial = await page.locator(".sign-in-submit").boundingBox();
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      await page.getByRole("button", { name: "Memeriksa akun…" }).waitFor();
      assert.equal(await page.locator(".sign-in-submit").isDisabled(), true);
      assert.equal(
        await page.locator(".sign-in-card").getAttribute("aria-busy"),
        "true",
      );
      await page.evaluate(() => {
        const form = document.querySelector(".sign-in-card");
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      const pending = await page.locator(".sign-in-submit").boundingBox();
      assert.equal(pending.width, initial.width);
      assert.equal(pending.height, initial.height);
      assert.equal(count, 1);
      release();
      await page.locator(".sign-in-toast").getByRole("alert").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Masuk", exact: true })
          .isEnabled(),
        true,
      );
    },
  );

  await scenario(
    "success acknowledges briefly then navigates to the existing root destination",
    async (page) => {
      await open(page);
      await credentials(page);
      await page.clock.install({ time: new Date("2026-10-13T00:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-13T00:00:00Z"));
      let payload;
      let navigationCount = 0;
      await page.route("**/api/auth/login", (route) => {
        assert.equal(route.request().method(), "POST");
        assert.match(
          route.request().headers()["content-type"],
          /application\/json/,
        );
        payload = route.request().postDataJSON();
        return route.fulfill({ status: 200, json: { ok: true } });
      });
      await page.route(`${baseURL}/`, (route) => {
        navigationCount++;
        assert.equal(route.request().isNavigationRequest(), true);
        return route.fulfill({
          contentType: "text/html",
          body: "<h1>Destination</h1>",
        });
      });
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      const status = page.locator(".sign-in-toast").getByRole("status");
      await status.waitFor();
      assert.match(await status.textContent(), /Berhasil masuk/);
      assert.match(await status.textContent(), /Menyiapkan ruang kerja Anda/);
      assert.deepEqual(payload, {
        nip: "TEST-LOGIN",
        password: "Uji-Login-123!",
      });
      assert.equal(await page.locator(".sign-in-submit").isDisabled(), true);
      await page.clock.runFor(179);
      assert.equal(navigationCount, 0);
      await page.clock.runFor(1);
      await page.getByRole("heading", { name: "Destination" }).waitFor();
      assert.equal(navigationCount, 1);
      assert.equal(page.url(), `${baseURL}/`);
    },
  );

  await scenario(
    "network failure leaves a safe retryable form",
    async (page) => {
      await page.route("**/api/auth/login", (route) => route.abort("failed"));
      await open(page);
      await credentials(page);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      await page.locator(".sign-in-toast").getByRole("alert").waitFor();
      assert.match(
        await page.locator(".sign-in-toast").getByRole("alert").textContent(),
        /Koneksi belum tersedia/,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Masuk", exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(
        await page.getByLabel("Kata sandi", { exact: true }).inputValue(),
        "Uji-Login-123!",
      );
    },
  );

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet-portrait", { width: 834, height: 1112 }],
    ["tablet-landscape", { width: 1024, height: 768 }],
    ["mobile", { width: 390, height: 844 }],
    ["small-mobile", { width: 320, height: 568 }],
  ]) {
    await scenario(
      `${name}: responsive layout and toast containment`,
      async (page) => {
        await open(page);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
        const card = await page.locator(".sign-in-card").boundingBox();
        assert.ok(card.x >= 0 && card.x + card.width <= viewport.width);
        const button = await page.locator(".sign-in-submit").boundingBox();
        if (viewport.width >= 390)
          assert.ok(
            button.y + button.height <= viewport.height,
            "CTA should remain above the fold",
          );
        await snapshot(page, name);
        await page.route("**/api/auth/login", (route) =>
          route.fulfill({ status: 401, json: {} }),
        );
        await credentials(page);
        await page.getByRole("button", { name: "Masuk", exact: true }).click();
        await page.locator(".sign-in-toast").getByRole("alert").waitFor();
        const toast = await page.locator(".sign-in-toast").boundingBox();
        assert.ok(
          toast.x >= 0 &&
            toast.x + toast.width <= viewport.width &&
            toast.y >= 0,
        );
      },
      { viewport },
    );
  }

  await scenario(
    "reduced motion disables card, decoration, toast and spinner animations",
    async (page) => {
      await open(page);
      for (const selector of [".sign-in-card", ".sign-in-atmosphere"]) {
        assert.equal(
          await page
            .locator(selector)
            .evaluate((element) => getComputedStyle(element).animationName),
          "none",
        );
      }
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      await page.route("**/api/auth/login", async (route) => {
        await held;
        await route.fulfill({ status: 401, json: {} });
      });
      await credentials(page);
      await page.getByRole("button", { name: "Masuk", exact: true }).click();
      await page.getByRole("button", { name: "Memeriksa akun…" }).waitFor();
      assert.equal(
        await page
          .locator(".sign-in-spinner--active")
          .evaluate((element) => getComputedStyle(element).animationName),
        "none",
      );
      release();
      await page.locator(".sign-in-toast").getByRole("alert").waitFor();
      assert.equal(
        await page
          .locator(".sign-in-toast")
          .evaluate((element) => getComputedStyle(element).animationName),
        "none",
      );
      await page.getByRole("button", { name: "Tutup notifikasi" }).click();
      await page.locator(".sign-in-toast").waitFor({ state: "detached" });
    },
    { reducedMotion: "reduce" },
  );

  await scenario(
    "200 percent text sizing preserves field and button access",
    async (page) => {
      await open(page);
      await page.addStyleTag({
        content:
          ".sign-in-layout { font-size: 200%; } .sign-in-layout input, .sign-in-layout button, .sign-in-layout label { font-size: 1em; }",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await credentials(page);
      assert.equal(
        await page
          .getByRole("button", { name: "Masuk", exact: true })
          .isVisible(),
        true,
      );
      await snapshot(page, "mobile-large-text");
    },
    { viewport: { width: 390, height: 844 } },
  );

  console.log(`${passed} browser scenarios passed.`);
} finally {
  await browser.close();
}
