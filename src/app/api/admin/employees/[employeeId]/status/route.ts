import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { EmployeeError } from "@/application/employees/service";
import { employeeErrorResponse } from "@/application/employees/http";
import { createEmployeeRuntime } from "@/infrastructure/employees/runtime";

export function createEmployeeStatusHandler(factory = createEmployeeRuntime) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ employeeId: string }> },
  ) {
    const runtime = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      const body = (await request.json().catch(() => null)) as {
        isActive?: unknown;
      } | null;
      if (typeof body?.isActive !== "boolean")
        throw new EmployeeError("VALIDATION", "Status aktif tidak valid.");
      return Response.json({
        employee: await runtime.employees.setActive(
          (await context.params).employeeId,
          body.isActive,
        ),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        employeeErrorResponse(error) ??
        Response.json(
          { error: "Operasi status pegawai gagal." },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}
export const PATCH = createEmployeeStatusHandler();
