import { z } from "zod";
import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { authorizedOfficialErrorResponse } from "@/application/leave-authorized-official/http";
import { LeaveAuthorizedOfficialError } from "@/application/leave-authorized-official/service";
import { createLeaveAuthorizedOfficialRuntime } from "@/infrastructure/leave-authorized-official/runtime";

export function createOfficialCorrectionHandlers(
  factory = createLeaveAuthorizedOfficialRuntime,
) {
  const handler =
    (write: boolean) =>
    async (request: Request, context: { params: Promise<{ id: string }> }) => {
      const runtime = factory();
      try {
        const principal = requireAdmin(
          await requireRequestPrincipal(request, runtime.authentication),
        );
        const { id } = await context.params;
        if (!z.uuid().safeParse(id).success)
          throw new LeaveAuthorizedOfficialError(
            "VALIDATION",
            "Identitas penugasan tidak valid.",
          );
        return Response.json(
          write
            ? {
                correction: await runtime.officialCorrections.correct(
                  principal,
                  id,
                  await request.json().catch(() => null),
                ),
              }
            : await runtime.officialCorrections.history(principal, id),
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        return (
          authorizationResponse(error) ??
          authorizedOfficialErrorResponse(error) ??
          Response.json(
            { error: "Koreksi pejabat cuti gagal diproses." },
            { status: 500 },
          )
        );
      } finally {
        await runtime.database.$disconnect();
      }
    };
  return { GET: handler(false), POST: handler(true) };
}
export const { GET, POST } = createOfficialCorrectionHandlers();
