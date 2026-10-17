import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";
import { DashboardService } from "@/application/dashboard/contracts";
import { OverlayService } from "@/application/dashboard/overlay";
import { PrismaDashboardReader } from "./reader";
import { PrismaOverlayRepository } from "./overlay-repository";
export function createDashboardRuntime() {
  const runtime = createRuntimeAuthentication();
  return {
    ...runtime,
    dashboard: new DashboardService(
      new PrismaDashboardReader(runtime.database),
    ),
    overlays: new OverlayService(new PrismaOverlayRepository(runtime.database)),
  };
}
