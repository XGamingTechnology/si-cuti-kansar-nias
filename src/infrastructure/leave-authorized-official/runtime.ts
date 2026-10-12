import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaLeaveAuthorizedOfficialRepository } from "./prisma-repository";

export function createLeaveAuthorizedOfficialRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    authorizedOfficials: new LeaveAuthorizedOfficialService(
      new PrismaLeaveAuthorizedOfficialRepository(runtime.database),
    ),
  };
}
