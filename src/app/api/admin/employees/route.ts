import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  employeeErrorResponse,
  employeeMutation,
  employeeInput,
} from "@/application/employees/http";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";

type Dependencies = ReturnType<typeof createEmployeeRuntime>;
export function createEmployeeCollectionHandlers(
  factory = createEmployeeRuntime,
) {
  const run =
    (
      operation: (
        runtime: Dependencies,
        request: Request,
        actorUserId: string,
      ) => Promise<Response>,
    ) =>
    async (request: Request) => {
      const runtime = factory();
      try {
        const principal = await requireRequestPrincipal(
          request,
          runtime.authentication,
        );
        requireAdmin(principal);
        return await operation(runtime, request, principal.userId);
      } catch (error) {
        return (
          authorizationResponse(error) ??
          employeeErrorResponse(error) ??
          Response.json({ error: "Operasi pegawai gagal." }, { status: 500 })
        );
      } finally {
        await runtime.database.$disconnect();
      }
    };
  return {
    GET: run(async (runtime) =>
      Response.json({ employees: await runtime.employees.list() }),
    ),
    POST: run(async (runtime, request, actorUserId) =>
      Response.json(
        {
          employee: await runtime.employees.create(
            await employeeInput(request),
            employeeMutation(request, actorUserId),
          ),
        },
        { status: 201 },
      ),
    ),
  };
}
const handlers = createEmployeeCollectionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
