import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  authorizedOfficialErrorResponse,
  authorizedOfficialInput,
} from "@/application/leave-authorized-official/http";
import { createLeaveAuthorizedOfficialRuntime } from "@/infrastructure/leave-authorized-official/runtime";

export function createAuthorizedOfficialItemHandler(
  factory = createLeaveAuthorizedOfficialRuntime,
) {
  return async (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const runtime = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      return Response.json({
        assignment: await runtime.authorizedOfficials.update(
          (await context.params).id,
          await authorizedOfficialInput(request),
        ),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        authorizedOfficialErrorResponse(error) ??
        Response.json({ error: "Data pejabat cuti gagal diperbarui." }, { status: 500 })
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const PUT = createAuthorizedOfficialItemHandler();
