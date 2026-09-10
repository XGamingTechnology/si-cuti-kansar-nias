import { z } from "zod";
import { AnnualBalanceAdministrationError } from "./administration";

const employeeIdSchema = z.string().uuid();

export function annualBalanceEmployeeId(value: string): string {
  if (!employeeIdSchema.safeParse(value).success)
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      "ID pegawai tidak valid.",
    );
  return value;
}

export function annualBalanceYear(request: Request): number {
  const raw = new URL(request.url).searchParams.get("year");
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(year) || year < 1900 || year > 9999)
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      "Tahun saldo tidak valid.",
    );
  return year;
}

export async function openingBalanceInput(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object")
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      "Data inisialisasi saldo tidak valid.",
    );
  if (
    typeof body.entitlementYear !== "number" ||
    typeof body.n1Days !== "number" ||
    typeof body.n2Days !== "number" ||
    typeof body.reason !== "string" ||
    typeof body.idempotencyKey !== "string"
  )
    throw new AnnualBalanceAdministrationError(
      "VALIDATION",
      "Data inisialisasi saldo tidak lengkap atau tidak valid.",
    );
  return {
    entitlementYear: body.entitlementYear,
    n1Days: body.n1Days,
    n2Days: body.n2Days,
    reason: body.reason,
    idempotencyKey: body.idempotencyKey,
  };
}

export function annualBalanceAdministrationErrorResponse(
  error: unknown,
): Response | null {
  if (!(error instanceof AnnualBalanceAdministrationError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION" ? 422 : 409;
  return Response.json({ error: error.message, code: error.code }, { status });
}
