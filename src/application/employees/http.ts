import type { EmployeeMutation } from "./mutation";
import { z } from "zod";
import { EmployeeError } from "./service";

const employeeIdSchema = z.string().uuid();

export function validateEmployeeId(value: string): string {
  if (!employeeIdSchema.safeParse(value).success)
    throw new EmployeeError("VALIDATION", "ID pegawai tidak valid.");
  return value;
}

export function employeeErrorResponse(error: unknown): Response | null {
  if (!(error instanceof EmployeeError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return Response.json({ error: error.message }, { status });
}

export async function employeeInput(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new EmployeeError("VALIDATION", "Data pegawai tidak valid.");
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "nip",
          "fullName",
          "positionTitle",
          "workUnit",
          "directSupervisorId",
          "employmentStartDate",
        ].includes(key),
    )
  )
    throw new EmployeeError("VALIDATION", "Kolom pegawai tidak dikenal.");
  if (
    body.employmentStartDate !== undefined &&
    body.employmentStartDate !== null &&
    typeof body.employmentStartDate !== "string"
  )
    throw new EmployeeError("VALIDATION", "Tanggal mulai bekerja tidak valid.");
  const fields = ["nip", "fullName", "positionTitle", "workUnit"] as const;
  if (fields.some((field) => typeof body[field] !== "string"))
    throw new EmployeeError("VALIDATION", "Data pegawai tidak lengkap.");
  if (
    body.directSupervisorId !== undefined &&
    body.directSupervisorId !== null &&
    typeof body.directSupervisorId !== "string"
  )
    throw new EmployeeError("VALIDATION", "Atasan langsung tidak valid.");
  if (
    typeof body.directSupervisorId === "string" &&
    body.directSupervisorId.trim() &&
    !employeeIdSchema.safeParse(body.directSupervisorId.trim()).success
  )
    throw new EmployeeError("VALIDATION", "Atasan langsung tidak valid.");
  return {
    nip: body.nip as string,
    fullName: body.fullName as string,
    positionTitle: body.positionTitle as string,
    workUnit: body.workUnit as string,
    directSupervisorId: body.directSupervisorId as string | null | undefined,
    employmentStartDate:
      typeof body.employmentStartDate === "string"
        ? body.employmentStartDate
        : null,
  };
}

export function employeeMutation(
  request: Request,
  actorUserId: string,
  version = false,
): EmployeeMutation {
  const origin = request.headers.get("origin");
  let originHost: string | undefined;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      originHost = parsed.host;
    } catch {
      throw new EmployeeError("VALIDATION", "Sumber permintaan tidak valid.");
    }
  }
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin &&
      originHost !== (request.headers.get("host") ?? new URL(request.url).host))
  )
    throw new EmployeeError("VALIDATION", "Sumber permintaan tidak valid.");
  if (!version) return { actorUserId };
  const expectedUpdatedAt = /^"(.*)"$/.exec(
    request.headers.get("if-match") ?? "",
  )?.[1];
  if (
    !expectedUpdatedAt ||
    !z.iso.datetime().safeParse(expectedUpdatedAt).success
  )
    throw new EmployeeError(
      "VALIDATION",
      "Muat ulang data pegawai sebelum mengubahnya.",
    );
  return { actorUserId, expectedUpdatedAt };
}
