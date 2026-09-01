import type { Principal } from "@/modules/auth/service";

export const APPLICATION_ROLES = ["ADMIN_KEPEGAWAIAN", "PEGAWAI"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: "Unauthenticated" | "Forbidden",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireAuthenticatedPrincipal(
  principal: Principal | null,
): Principal {
  if (!principal) throw new AuthorizationError(401, "Unauthenticated");
  return principal;
}

export function requireRole(
  principal: Principal,
  role: ApplicationRole,
): Principal {
  if (principal.role !== role) throw new AuthorizationError(403, "Forbidden");
  return principal;
}

export function requireAdmin(principal: Principal): Principal {
  return requireRole(principal, "ADMIN_KEPEGAWAIAN");
}

export function canReadEmployee(
  principal: Principal,
  employee: Readonly<{ id: string }>,
): boolean {
  if (principal.role === "ADMIN_KEPEGAWAIAN") return true;
  if (principal.role === "PEGAWAI") return employee.id === principal.employeeId;
  return false;
}

export function requireEmployeeRead(
  principal: Principal,
  employee: Readonly<{ id: string }>,
): void {
  if (!canReadEmployee(principal, employee)) {
    throw new AuthorizationError(403, "Forbidden");
  }
}
