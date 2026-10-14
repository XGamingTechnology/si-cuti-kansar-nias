import { LeaveRecordsService } from "@/application/leave-records/service";
import { PrismaLeaveRecordsRepository } from "@/infrastructure/leave-records/prisma-repository";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
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
    records: new LeaveRecordsService({
      repository: new PrismaLeaveRecordsRepository(services.database),
      storage: new LocalPrivateStorage(environment.PRIVATE_STORAGE_PATH),
    }),
    authentication: new AuthenticationService(
      new PrismaAuthRepository(services.database),
      environment.SESSION_TTL_SECONDS,
    ),
  };
}
