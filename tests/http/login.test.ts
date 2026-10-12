import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ login: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/infrastructure/auth/runtime", () => ({
  createRuntimeAuthentication: () => ({
    authentication: { login: runtime.login },
    database: { $disconnect: runtime.disconnect },
    environment: { NODE_ENV: "production", SESSION_TTL_SECONDS: 28800 },
  }),
}));
import { POST } from "@/app/api/auth/login/route";

const request = (body: string) =>
  new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
beforeEach(() => {
  runtime.login.mockReset();
  runtime.disconnect.mockReset();
});

describe("Unchanged login HTTP contract", () => {
  it("accepts NIP/password, returns ok and retains production session cookie options", async () => {
    runtime.login.mockResolvedValue({ token: "synthetic-session-token" });
    const response = await POST(
      request(
        JSON.stringify({ nip: " TEST-LOGIN ", password: "synthetic-password" }),
      ),
    );
    expect(runtime.login).toHaveBeenCalledWith(
      "TEST-LOGIN",
      "synthetic-password",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("si_cuti_session=synthetic-session-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).toContain("Path=/");
    expect(runtime.disconnect).toHaveBeenCalledOnce();
  });
  it.each([
    "not json",
    JSON.stringify({ nip: "", password: "" }),
    JSON.stringify({ nip: "X".repeat(33), password: "synthetic" }),
  ])("rejects invalid transport input generically: %s", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "NIP atau kata sandi tidak valid.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(runtime.login).not.toHaveBeenCalled();
  });
  it("keeps backend failure details private and does not issue a cookie", async () => {
    runtime.login.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAILS"));
    const response = await POST(
      request(JSON.stringify({ nip: "TEST-LOGIN", password: "synthetic" })),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "NIP atau kata sandi tidak valid.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(runtime.disconnect).toHaveBeenCalledOnce();
  });
});
