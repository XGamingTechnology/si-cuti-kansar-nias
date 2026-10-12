import {
  requireRequestPrincipal,
  authorizationResponse,
} from "@/application/authorization/http";
import { requireAdmin } from "@/application/authorization/policy";
import { createRuntimeAuthentication } from "@/infrastructure/auth/runtime";

type Dependencies = ReturnType<typeof createRuntimeAuthentication>;

export function createAdminAccessHandler(
  createDependencies = createRuntimeAuthentication,
) {
  return async function GET(request: Request) {
    const runtime: Dependencies = createDependencies();
    try {
      const principal = await requireRequestPrincipal(
        request,
        runtime.authentication,
      );
      requireAdmin(principal);
      return Response.json({ access: "ADMIN_KEPEGAWAIAN" });
    } catch (error) {
      const response = authorizationResponse(error);
      if (response) return response;
      throw error;
    } finally {
      await runtime.database.$disconnect();
    }
  };
}

export const GET = createAdminAccessHandler();
