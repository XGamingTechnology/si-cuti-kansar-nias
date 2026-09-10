import {
  authorizationResponse,
  requireRequestPrincipal,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import {
  annualBalanceAdministrationErrorResponse,
  annualBalanceYear,
} from "@/application/leave-balance/administration-http";
import { createAnnualBalanceAdministrationRuntime } from "@/infrastructure/leave-balance/runtime";

export function createAnnualBalanceCollectionHandler(
  factory = createAnnualBalanceAdministrationRuntime,
) {
  return async (request: Request) => {
    const runtime = factory();
    try {
      requireAdmin(
        await requireRequestPrincipal(request, runtime.authentication),
      );
      return Response.json({
        balances: await runtime.annualBalances.list(annualBalanceYear(request)),
      });
    } catch (error) {
      return (
        authorizationResponse(error) ??
        annualBalanceAdministrationErrorResponse(error) ??
        Response.json(
          { error: "Data saldo cuti gagal dimuat.", code: "INTERNAL_ERROR" },
          { status: 500 },
        )
      );
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const GET = createAnnualBalanceCollectionHandler();
