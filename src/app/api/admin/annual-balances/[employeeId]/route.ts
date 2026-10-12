import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  annualBalanceAdministrationErrorResponse,
  annualBalanceEmployeeId,
  annualBalanceYear,
} from "@/application/leave-balance/administration-http";
import { createAnnualBalanceAdministrationRuntime } from "@/infrastructure/leave-balance/runtime";

type Context = { params: Promise<{ employeeId: string }> };
export function createAnnualBalanceDetailHandler(
  factory = createAnnualBalanceAdministrationRuntime,
) {
  return async (request: Request, context: Context) => {
    const runtime = factory();
    try {
      const principal = requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      void principal;
      return Response.json({
        balance: await runtime.annualBalances.get(
          annualBalanceEmployeeId((await context.params).employeeId),
          annualBalanceYear(request),
        ),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        annualBalanceAdministrationErrorResponse(error) ??
        Response.json(
          { error: "Detail saldo cuti gagal dimuat.", code: "INTERNAL_ERROR" },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const GET = createAnnualBalanceDetailHandler();
