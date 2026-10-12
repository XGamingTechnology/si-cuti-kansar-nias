import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  employeeErrorResponse,
  employeeInput,
  validateEmployeeId,
} from "@/application/employees/http";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";

type Dependencies = ReturnType<typeof createEmployeeRuntime>;
type Context = { params: Promise<{ employeeId: string }> };
export function createEmployeeItemHandlers(factory = createEmployeeRuntime) {
  const run =
    (
      operation: (
        runtime: Dependencies,
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
          validateEmployeeId((await context.params).employeeId),
        );
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
    GET: run(async (runtime, _request, id) => {
      const employee = await runtime.employees.findById(id);
      return employee
        ? Response.json({ employee })
        : Response.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
    }),
    PATCH: run(async (runtime, request, id) =>
      Response.json({
        employee: await runtime.employees.update(
          id,
          await employeeInput(request),
        ),
      }),
    ),
  };
}
const handlers = createEmployeeItemHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
