import { z } from "zod";
import {
  LeaveAuthorizedOfficialError,
  type LeaveAuthorizedOfficialInput,
} from "./service";

const schema = z.object({
  fullName: z.string(),
  nip: z.string(),
  capacity: z.enum(["DEFINITIVE", "PLT", "PLH"]),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  sourceReference: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function authorizedOfficialInput(
  request: Request,
): Promise<LeaveAuthorizedOfficialInput> {
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Data penugasan pejabat cuti tidak lengkap atau tidak valid.",
    );
  return result.data;
}

export function authorizedOfficialErrorResponse(error: unknown) {
  if (!(error instanceof LeaveAuthorizedOfficialError)) return null;
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "OVERLAP" ? 409 : 422;
  return Response.json({ error: error.message, code: error.code }, { status });
}
