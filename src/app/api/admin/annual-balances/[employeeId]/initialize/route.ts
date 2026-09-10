import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  annualBalanceAdministrationErrorResponse,
  annualBalanceEmployeeId,
  openingBalanceInput,
} from "@/application/leave-balance/administration-http";
import { createAnnualBalanceAdministrationRuntime } from "@/infrastructure/leave-balance/runtime";

type Context = { params: Promise<{ employeeId: string }> };
export function createOpeningBalanceHandler(
  factory = createAnnualBalanceAdministrationRuntime,
) {
  return async (request: Request, context: Context) => {
    const runtime = factory();
    try {
      const principal = requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      const input = await openingBalanceInput(request);
      return Response.json(
        {
          balance: await runtime.annualBalances.initialize({
            employeeId: annualBalanceEmployeeId(
              (await context.params).employeeId,
            ),
            entitlementYear: input.entitlementYear,
            n1Days: input.n1Days,
            n2Days: input.n2Days,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            actorUserId: principal.userId,
          }),
        },
        { status: 201 },
      );
    } catch (error) {
      return (
        authorizationResponse(error) ??
        annualBalanceAdministrationErrorResponse(error) ??
        Response.json(
          { error: "Inisialisasi saldo cuti gagal.", code: "INTERNAL_ERROR" },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const POST = createOpeningBalanceHandler();
