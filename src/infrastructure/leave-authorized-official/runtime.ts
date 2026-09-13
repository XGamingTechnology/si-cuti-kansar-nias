import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { parseServerEnvironment } from "@/config/env";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaLeaveAuthorizedOfficialRepository } from "./prisma-repository";

export function createLeaveAuthorizedOfficialRuntime() {
  const environment = parseServerEnvironment();
  const database = createDatabaseClient(environment.DATABASE_URL);
  const repository = new PrismaLeaveAuthorizedOfficialRepository(database);
  return {
    database,
    officials: new LeaveAuthorizedOfficialService(repository),
    authentication: new AuthenticationService(
      new PrismaAuthRepository(database),
      environment.SESSION_TTL_SECONDS,
    ),
  };
}
