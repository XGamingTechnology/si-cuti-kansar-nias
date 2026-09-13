import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  authorizedOfficialErrorResponse,
  authorizedOfficialId,
  authorizedOfficialInput,
} from "@/application/leave-authorized-official/http";
import { createLeaveAuthorizedOfficialRuntime } from "@/infrastructure/leave-authorized-official/runtime";

type Runtime = ReturnType<typeof createLeaveAuthorizedOfficialRuntime>;
type Context = { params: Promise<{ id: string }> };
export function createLeaveAuthorizedOfficialItemHandlers(
  factory = createLeaveAuthorizedOfficialRuntime,
) {
  const run =
    (
      operation: (
        runtime: Runtime,
        request: Request,
        id: string,
      ) => Promise<Response>,
    ) =>
    async (request: Request, context: Context) => {
      const runtime = factory();
      try {
        requireAdmin(
          await requireRequestPrincipal(request, runtime.authentication),
        );
        return await operation(
          runtime,
          request,
          authorizedOfficialId((await context.params).id),
        );
      } catch (error) {
        return (
          authorizationResponse(error) ??
          authorizedOfficialErrorResponse(error) ??
          Response.json(
            { error: "Operasi master pejabat cuti gagal." },
            { status: 500 },
          )
        );
      } finally {
        await runtime.database.$disconnect();
      }
    };
  return {
    GET: run(async (runtime, _request, id) =>
      Response.json({ assignment: await runtime.officials.get(id) }),
    ),
    PUT: run(async (runtime, request, id) =>
      Response.json({
        assignment: await runtime.officials.update(
          id,
          await authorizedOfficialInput(request),
        ),
      }),
    ),
  };
}
const handlers = createLeaveAuthorizedOfficialItemHandlers();
export const GET = handlers.GET;
export const PUT = handlers.PUT;
