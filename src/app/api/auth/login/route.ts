import { NextResponse } from "next/server";
import { z } from "zod";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PUBLIC_AUTH_ERROR } from "@/modules/auth/service";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/modules/auth/session";

const loginSchema = z.object({ nip: z.string().trim().min(1).max(32), password: z.string().min(1).max(1024) });

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: PUBLIC_AUTH_ERROR }, { status: 401 });
  const runtime = createRuntimeAuthentication();
  try {
    const result = await runtime.authentication.login(parsed.data.nip, parsed.data.password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(runtime.environment.NODE_ENV === "production", runtime.environment.SESSION_TTL_SECONDS));
    return response;
  } catch {
    return NextResponse.json({ error: PUBLIC_AUTH_ERROR }, { status: 401 });
  } finally {
    await runtime.database.$disconnect();
  }
}
