import { NextResponse } from "next/server";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/modules/auth/session";

export async function POST(request: Request) {
  const runtime = createRuntimeAuthentication();
  try {
    const token = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
    await runtime.authentication.logout(token);
  } finally {
    await runtime.database.$disconnect();
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(runtime.environment.NODE_ENV === "production", 0), expires: new Date(0) });
  return response;
}
