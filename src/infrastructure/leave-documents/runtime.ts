import { LeaveDocumentService } from "@/application/leave-documents/service";
import { parseServerEnvironment } from "@/config/env";
import { PrismaLeaveDocumentRepository } from "./prisma-leave-document-repository";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { createWorkflowRuntime } from "@/infrastructure/workflow/runtime";

export function createLeaveDocumentRuntime() {
  const environment = parseServerEnvironment();
  const workflow = createWorkflowRuntime();
  return {
    ...workflow,
    documents: new LeaveDocumentService(
      new PrismaLeaveDocumentRepository(workflow.database),
      new LocalPrivateStorage(environment.PRIVATE_STORAGE_PATH),
    ),
  };
}

export type LeaveDocumentRuntime = ReturnType<typeof createLeaveDocumentRuntime>;
