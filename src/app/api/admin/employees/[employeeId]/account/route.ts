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

type Dependencies = ReturnType<typeof createAccountAdministrationRuntime>;
type Context = { params: Promise<{ employeeId: string }> };

export function createAccountHandlers(
  factory = createAccountAdministrationRuntime,
) {
  const run =
    (
      operation: (
        runtime: Dependencies,
        request: Request,
        id: string,
        actorUserId: string,
      ) => Promise<Response>,
    ) =>
    async (request: Request, context: Context) => {
      const runtime = factory();
      try {
        const principal = await requireRequestPrincipal(
          request,
          runtime.authentication,
        );
        requireAdmin(principal);
        const id = validateAccountEmployeeId((await context.params).employeeId);
        return await operation(runtime, request, id, principal.userId);
      } catch (error) {
        return (
          authorizationResponse(error) ??
          accountErrorResponse(error) ??
          employeeErrorResponse(error) ??
          Response.json(
            { error: "Operasi administrasi akun gagal." },
            { status: 500 },
          )
        );
      } finally {
        await runtime.database.$disconnect();
      }
    };

  return {
    GET: run(async (runtime, _request, id) =>
      Response.json({ account: await runtime.accounts.findByEmployeeId(id) }),
    ),
    POST: run(async (runtime, request, id, actorUserId) => {
      const body = await accountBody(request, ["role", "password"]);
      return Response.json(
        {
          account: await runtime.accounts.provision(
            id,
            {
              role: body.role,
              password: body.password,
            },
            employeeMutation(request, actorUserId),
          ),
        },
        { status: 201 },
      );
    }),
    PATCH: run(async (runtime, request, id, actorUserId) =>
      Response.json({
        account: await runtime.accounts.update(
          id,
          await accountBody(request, ["role", "isActive"]),
          employeeMutation(request, actorUserId),
        ),
      }),
    ),
  };
}

const handlers = createAccountHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
