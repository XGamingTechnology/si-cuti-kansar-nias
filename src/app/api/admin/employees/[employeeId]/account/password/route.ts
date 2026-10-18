import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  accountBody,
  accountErrorResponse,
  validateAccountEmployeeId,
} from "@/application/accounts/http";
import {
  employeeMutation,
  employeeErrorResponse,
} from "@/application/employees/http";
import { createAccountAdministrationRuntime } from "@/infrastructure/accounts/runtime";

export function createAccountPasswordHandler(
  factory = createAccountAdministrationRuntime,
) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ employeeId: string }> },
  ) {
    const runtime = factory();
    try {
      const principal = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      requireAdmin(principal);
      const id = validateAccountEmployeeId((await context.params).employeeId);
      const body = await accountBody(request, ["password"]);
      return Response.json({
        account: await runtime.accounts.resetPassword(
          id,
          body.password,
          new Date(),
          employeeMutation(request, principal.userId),
        ),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        accountErrorResponse(error) ??
        employeeErrorResponse(error) ??
        Response.json({ error: "Operasi kata sandi gagal." }, { status: 500 })
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const PATCH = createAccountPasswordHandler();
