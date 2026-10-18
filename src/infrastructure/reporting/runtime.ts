import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { ReportingService } from "@/application/reporting/service";
import { PrismaReportRepository } from "./repository";
import { PrismaReportReader } from "./reader";
import { LocalReportFiles } from "./files";
import { ReportRenderersAdapter } from "./renderers";
export function createReportingRuntime() {
  const root = process.env.REPORT_STORAGE_PATH,
    key = process.env.REPORT_AUDIT_HASH_KEY;
  if (!root || !key || key.length < 32)
    throw new Error("Konfigurasi storage/hash laporan belum valid.");
  const files = new LocalReportFiles(
    root,
    process.env.PRIVATE_STORAGE_PATH ?? "",
  );
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    reporting: new ReportingService(
      new PrismaReportRepository(runtime.database),
      new PrismaReportReader(runtime.database),
      files,
      new ReportRenderersAdapter(),
      key,
    ),
  };
}
