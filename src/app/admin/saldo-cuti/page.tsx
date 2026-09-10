import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { isAdminPrincipal } from "@/application/authorization/policy";

export const dynamic = "force-dynamic";

export default async function AnnualBalancePage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/");

  const runtime = createRuntimeAuthentication();
  try {
    const principal = await runtime.authentication.validate(token);
    if (!principal || !isAdminPrincipal(principal)) redirect("/");

    return (
      <AuthenticatedShell principal={principal} initialAdminSurface="saldo" />
    );
  } finally {
    await runtime.database.$disconnect();
  }
}
