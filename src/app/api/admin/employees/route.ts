import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  employeeErrorResponse,
  employeeInput,
} from "@/application/employees/http";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";

type Dependencies = ReturnType<typeof createEmployeeRuntime>;
export function createEmployeeCollectionHandlers(
  factory = createEmployeeRuntime,
) {
  const run =
    (
      operation: (runtime: Dependencies, request: Request) => Promise<Response>,
    ) =>
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
    POST: run(async (runtime, request) =>
      Response.json(
        {
          employee: await runtime.employees.create(
            await employeeInput(request),
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
