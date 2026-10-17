import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/");
  const runtime = createRuntimeAuthentication();
  try {
    const principal = await runtime.authentication.validate(token);
    if (!principal) redirect("/");
    const query = await searchParams;
    return (
      <AuthenticatedShell
        principal={principal}
        initialAdminSurface="pengajuan"
        initialWorkflow={{
          kind: query.kind === "permission" ? "permission" : "leave",
          create: query.new === "1",
          requestId:
            typeof query.request === "string" ? query.request : undefined,
        }}
      />
    );
  } finally {
    await runtime.database.$disconnect();
  }
}
