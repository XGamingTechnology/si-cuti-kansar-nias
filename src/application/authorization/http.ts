import type { AuthenticationService, Principal } from "@/modules/auth/service";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { AuthorizationError, requireAuthenticatedPrincipal } from "./policy";

export type SessionValidator = Pick<AuthenticationService, "validate">;

function sessionToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
}

export async function requireRequestPrincipal(
  request: Request,
  authentication: SessionValidator,
): Promise<Principal> {
  return requireAuthenticatedPrincipal(
    await authentication.validate(sessionToken(request)),
  );
}

export function authorizationResponse(error: unknown): Response | null {
  if (!(error instanceof AuthorizationError)) return null;
  const message =
    error.status === 401 ? "Autentikasi diperlukan." : "Akses ditolak.";
  return Response.json({ error: message }, { status: error.status });
}
