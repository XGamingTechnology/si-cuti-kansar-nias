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

export function createAuthorizedOfficialCollectionHandler(
  factory = createLeaveAuthorizedOfficialRuntime,
) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      if (request.method === "GET")
        return Response.json({ assignments: await runtime.authorizedOfficials.list() });
      if (request.method === "POST")
        return Response.json(
          { assignment: await runtime.authorizedOfficials.create(await authorizedOfficialInput(request)) },
          { status: 201 },
        );
      return Response.json({ error: "Metode tidak didukung." }, { status: 405 });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        authorizedOfficialErrorResponse(error) ??
        Response.json({ error: "Data pejabat cuti gagal diproses." }, { status: 500 })
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

const handler = createAuthorizedOfficialCollectionHandler();
export const GET = handler;
export const POST = handler;
