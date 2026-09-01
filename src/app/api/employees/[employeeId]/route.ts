import {
  requireRequestPrincipal,
  authorizationResponse,
} from "@/application/authorization/http";
import { requireEmployeeRead } from "@/application/authorization/policy";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import {
  PrismaEmployeeReader,
  type EmployeeReader,
} from "@/infrastructure/employees/prisma-employee-reader";

type Runtime = ReturnType<typeof createRuntimeAuthentication>;
type Dependencies = Runtime & { employees: EmployeeReader };

function createDependencies(): Dependencies {
  const runtime = createRuntimeAuthentication();
  return { ...runtime, employees: new PrismaEmployeeReader(runtime.database) };
}

export function createEmployeeReadHandler(factory = createDependencies) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ employeeId: string }> },
  ) {
    const runtime = factory();
    try {
      const principal = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      const { employeeId } = await context.params;

      // Evaluate access against the requested identifier before reading its data.
      // This prevents a forbidden caller from learning whether another employee exists.
      requireEmployeeRead(principal, { id: employeeId });
      const employee = await runtime.employees.findById(employeeId);
      if (!employee)
        return Response.json(
          { error: "Sumber daya tidak ditemukan." },
          { status: 404 },
        );
      return Response.json({ employee });
    } catch (error) {
      const response = authorizationResponse(error);
      if (response) return response;
      throw error;
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const GET = createEmployeeReadHandler();
