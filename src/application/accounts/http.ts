import { z } from "zod";
import { AccountAdministrationError } from "./service";

const employeeIdSchema = z.string().uuid();

export function validateAccountEmployeeId(value: string): string {
  if (!employeeIdSchema.safeParse(value).success)
    throw new AccountAdministrationError(
      "VALIDATION",
      "ID pegawai tidak valid.",
    );
  return value;
}

export async function accountBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccountAdministrationError(
      "VALIDATION",
      "Data akun tidak valid.",
    );
  return body as Record<string, unknown>;
}

export function accountErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AccountAdministrationError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return Response.json({ error: error.message }, { status });
}
