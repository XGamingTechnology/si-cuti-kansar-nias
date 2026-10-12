import { AnnualBalanceBatchImportService } from "@/application/leave-balance/batch-import";
import { XlsxWorkbookReader } from "@/infrastructure/employees/xlsx-workbook-reader";
import { AnnualBalanceAdministrationService } from "@/application/leave-balance/administration";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaAnnualBalanceAdministrationRepository } from "./prisma-annual-balance-administration-repository";

export function createAnnualBalanceAdministrationRuntime() {
  const runtime = createRuntimeAuthentication();
  const repository = new PrismaAnnualBalanceAdministrationRepository(
    runtime.database,
  );
  return {
    ...runtime,
    balanceImport: new AnnualBalanceBatchImportService(
      new XlsxWorkbookReader(true),
      repository,
    ),
    annualBalances: new AnnualBalanceAdministrationService(repository),
  };
}
