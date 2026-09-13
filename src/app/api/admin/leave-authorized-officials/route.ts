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

type Runtime = ReturnType<typeof createLeaveAuthorizedOfficialRuntime>;
export function createLeaveAuthorizedOfficialCollectionHandlers(
  factory = createLeaveAuthorizedOfficialRuntime,
) {
  const run =
    (operation: (runtime: Runtime, request: Request) => Promise<Response>) =>
    async (request: Request) => {
      const runtime = factory();
      try {
        requireAdmin(
          await requireRequestPrincipal(request, runtime.authentication),
        );
        return await operation(runtime, request);
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
    GET: run(async (runtime) =>
      Response.json({ assignments: await runtime.officials.list() }),
    ),
    POST: run(async (runtime, request) =>
      Response.json(
        {
          assignment: await runtime.officials.create(
            await authorizedOfficialInput(request),
          ),
        },
        { status: 201 },
      ),
    ),
  };
}
const handlers = createLeaveAuthorizedOfficialCollectionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
