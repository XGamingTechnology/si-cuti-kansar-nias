import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "si_cuti_session";
export const sessionCookieOptions = (production: boolean, maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: production,
  path: "/",
  maxAge,
});

export function createSessionToken() { return randomBytes(32).toString("base64url"); }
export function digestSessionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
