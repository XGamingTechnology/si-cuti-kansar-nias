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
      ) => Promise<Response>,
    ) =>
    async (request: Request, context: Context) => {
      const runtime = factory();
      try {
        requireAdmin(
          await requireRequestPrincipal(request, runtime.authentication),
        );
        const id = validateAccountEmployeeId((await context.params).employeeId);
        return await operation(runtime, request, id);
      } catch (error) {
        return (
          authorizationResponse(error) ??
          accountErrorResponse(error) ??
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
    POST: run(async (runtime, request, id) => {
      const body = await accountBody(request);
      return Response.json(
        {
          account: await runtime.accounts.provision(id, {
            role: body.role,
            password: body.password,
          }),
        },
        { status: 201 },
      );
    }),
    PATCH: run(async (runtime, request, id) =>
      Response.json({
        account: await runtime.accounts.update(id, await accountBody(request)),
      }),
    ),
  };
}

const handlers = createAccountHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
