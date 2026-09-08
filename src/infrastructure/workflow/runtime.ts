import {
  LeaveWorkflowService,
  PermissionWorkflowService,
} from "@/application/workflow";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaWorkflowRepository } from "./prisma-workflow-repository";

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
