import { OfficialCorrectionService } from "@/application/leave-authorized-official/correction";
import { PrismaOfficialCorrectionRepository } from "./correction-repository";
import { LeaveAuthorizedOfficialService } from "@/application/leave-authorized-official/service";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { PrismaLeaveAuthorizedOfficialRepository } from "./prisma-repository";

export function createLeaveAuthorizedOfficialRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    officialCorrections: new OfficialCorrectionService(
      new PrismaOfficialCorrectionRepository(runtime.database),
    ),
    authorizedOfficials: new LeaveAuthorizedOfficialService(
      new PrismaLeaveAuthorizedOfficialRepository(runtime.database),
    ),
  };
}
