import { EmployeeError } from "./service";

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
  if (!body || typeof body !== "object")
    throw new EmployeeError("VALIDATION", "Data pegawai tidak valid.");
  const fields = ["nip", "fullName", "positionTitle", "workUnit"] as const;
  if (fields.some((field) => typeof body[field] !== "string"))
    throw new EmployeeError("VALIDATION", "Data pegawai tidak lengkap.");
  if (
    body.directSupervisorId !== undefined &&
    body.directSupervisorId !== null &&
    typeof body.directSupervisorId !== "string"
  )
    throw new EmployeeError("VALIDATION", "Atasan langsung tidak valid.");
  return {
    nip: body.nip as string,
    fullName: body.fullName as string,
    positionTitle: body.positionTitle as string,
    workUnit: body.workUnit as string,
    directSupervisorId: body.directSupervisorId as string | null | undefined,
  };
}
