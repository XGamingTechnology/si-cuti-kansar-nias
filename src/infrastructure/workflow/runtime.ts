import {
  LeaveWorkflowService,
  PermissionWorkflowService,
} from "@/application/workflow";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaWorkflowRepository } from "./prisma-workflow-repository";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
import { parseServerEnvironment } from "@/config/env";
import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { PrismaLeaveAuthorizedOfficialRepository } from "@/infrastructure/leave-authorized-official/prisma-repository";

export function createWorkflowServices(
  connectionString = process.env.DATABASE_URL,
) {
  const database = createDatabaseClient(connectionString);
  const repository = new PrismaWorkflowRepository(database);
  return {
    database,
    repository,
    leave: new LeaveWorkflowService(repository),
    permission: new PermissionWorkflowService(repository),
    officials: new LeaveAuthorizedOfficialService(
      new PrismaLeaveAuthorizedOfficialRepository(database),
    ),
  };
}

export function createWorkflowRuntime() {
  const environment = parseServerEnvironment();
  const services = createWorkflowServices(environment.DATABASE_URL);
  return {
    ...services,
    authentication: new AuthenticationService(
      new PrismaAuthRepository(services.database),
      environment.SESSION_TTL_SECONDS,
    ),
  };
}
