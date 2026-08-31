import { cookies } from "next/headers";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { LoginForm } from "@/components/login-form";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return <main className="login-page"><LoginForm /></main>;
  const runtime = createRuntimeAuthentication();
  try {
    const principal = await runtime.authentication.validate(token);
    if (!principal) return <main className="login-page"><LoginForm sessionExpired /></main>;
    return <AuthenticatedShell principal={principal} />;
  } finally {
    await runtime.database.$disconnect();
  }
}
