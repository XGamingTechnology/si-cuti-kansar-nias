import {
  LeaveWorkflowService,
  PermissionWorkflowService,
} from "@/application/workflow";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaWorkflowRepository } from "./prisma-workflow-repository";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
import { parseServerEnvironment } from "@/config/env";

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
