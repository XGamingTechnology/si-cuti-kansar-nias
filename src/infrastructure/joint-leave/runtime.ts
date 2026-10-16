import { createWorkflowRuntime } from "@/infrastructure/workflow/runtime";
import { LocalPrivateStorage } from "@/infrastructure/storage/local-private-storage";
import { parseServerEnvironment } from "@/config/env";
import { JointLeaveService } from "@/application/joint-leave/service";
import { PrismaJointLeaveRepository } from "./prisma-repository";

export function createJointLeaveRuntime() {
  const environment = parseServerEnvironment(),
    runtime = createWorkflowRuntime();
  return {
    ...runtime,
    jointLeave: new JointLeaveService(
      new PrismaJointLeaveRepository(runtime.database),
      new LocalPrivateStorage(environment.PRIVATE_STORAGE_PATH),
    ),
  };
}
