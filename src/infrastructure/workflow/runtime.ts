import {
  LeaveWorkflowService,
  PermissionWorkflowService,
} from "@/application/workflow";
import { LeaveSubmissionProofService } from "@/application/leave-documents/submission-proof-service";
import type { DocumentStorage } from "@/application/ports/document-storage";
import { createDatabaseClient } from "@/infrastructure/database/client";
import { PrismaLeaveDocumentRepository } from "@/infrastructure/leave-documents/prisma-leave-document-repository";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { AuthenticationService } from "@/modules/auth/service";
import { PrismaAuthRepository } from "@/infrastructure/auth/prisma-auth-repository";
import { parseServerEnvironment } from "@/config/env";
import { PrismaWorkflowRepository } from "./prisma-workflow-repository";

export function createWorkflowServices(
  connectionString = process.env.DATABASE_URL,
  documentStorage?: DocumentStorage,
) {
  const database = createDatabaseClient(connectionString);
  const repository = new PrismaWorkflowRepository(database);

  return {
    database,
    repository,
    leave: new LeaveWorkflowService(repository, documentStorage),
    permission: new PermissionWorkflowService(repository),
  };
}

export function createWorkflowRuntime() {
  const environment = parseServerEnvironment();
  const documentStorage = new LocalPrivateStorage(
    environment.PRIVATE_STORAGE_PATH,
  );
  const services = createWorkflowServices(
    environment.DATABASE_URL,
    documentStorage,
  );

  const leaveDocumentRepository = new PrismaLeaveDocumentRepository(
    services.database,
  );

  return {
    ...services,
    leaveSubmissionProof: new LeaveSubmissionProofService(
      leaveDocumentRepository,
      documentStorage,
    ),
    authentication: new AuthenticationService(
      new PrismaAuthRepository(services.database),
      environment.SESSION_TTL_SECONDS,
    ),
  };
}
