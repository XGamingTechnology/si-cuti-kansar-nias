import { z } from "zod";
import {
  LeaveAuthorizedOfficialError,
  type LeaveAuthorizedOfficialCapacity,
  type LeaveAuthorizedOfficialWrite,
} from "./service";

const idSchema = z.string().uuid();
export function authorizedOfficialId(value: string) {
  if (!idSchema.safeParse(value).success)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "ID pejabat tidak valid.",
    );
  return value;
}
export async function authorizedOfficialInput(
  request: Request,
): Promise<LeaveAuthorizedOfficialWrite> {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object")
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Data pejabat tidak valid.",
    );
  for (const field of ["fullName", "nip", "capacity", "effectiveFrom"])
    if (typeof body[field] !== "string")
      throw new LeaveAuthorizedOfficialError(
        "VALIDATION",
        "Data pejabat tidak lengkap.",
      );
  for (const field of ["effectiveTo", "sourceReference", "notes"])
    if (
      body[field] !== undefined &&
      body[field] !== null &&
      typeof body[field] !== "string"
    )
      throw new LeaveAuthorizedOfficialError(
        "VALIDATION",
        "Data pejabat tidak valid.",
      );
  return {
    fullName: body.fullName as string,
    nip: body.nip as string,
    capacity: body.capacity as LeaveAuthorizedOfficialCapacity,
    effectiveFrom: body.effectiveFrom as string,
    effectiveTo: body.effectiveTo as string | null | undefined,
    sourceReference: body.sourceReference as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}
export function authorizedOfficialErrorResponse(
  error: unknown,
): Response | null {
  if (!(error instanceof LeaveAuthorizedOfficialError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION" ? 422 : 409;
  return Response.json({ error: error.message, code: error.code }, { status });
}
