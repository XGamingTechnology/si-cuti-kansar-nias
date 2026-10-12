import { AccountAdministrationService } from "@/application/accounts/service";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaAccountAdministrationRepository } from "./prisma-account-administration-repository";

export function createAccountAdministrationRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    accounts: new AccountAdministrationService(
      new PrismaAccountAdministrationRepository(runtime.database),
    ),
  };
}
