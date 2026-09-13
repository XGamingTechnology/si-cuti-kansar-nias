import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminPrincipal } from "@/application/authorization/policy";
import { LeaveAuthorizedOfficialManagement } from "@/components/leave-authorized-official-management";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function LeaveAuthorizedOfficialPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/");
  const runtime = createRuntimeAuthentication();
  try {
    const principal = await runtime.authentication.validate(token);
    if (!principal || !isAdminPrincipal(principal)) redirect("/");
    return <LeaveAuthorizedOfficialManagement />;
  } finally {
    await runtime.database.$disconnect();
  }
}
