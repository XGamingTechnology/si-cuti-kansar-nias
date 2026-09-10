import { AnnualBalanceAdministrationService } from "@/application/leave-balance/administration";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaAnnualBalanceAdministrationRepository } from "./prisma-annual-balance-administration-repository";

export function createAnnualBalanceAdministrationRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    annualBalances: new AnnualBalanceAdministrationService(
      new PrismaAnnualBalanceAdministrationRepository(runtime.database),
    ),
  };
}
