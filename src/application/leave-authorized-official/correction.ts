import { toBusinessDate } from "@/domain/business-date";
import { z } from "zod";
import type { Principal } from "@/modules/auth/service";
import { requireAdmin } from "@/application/authorization/policy";
import {
  LeaveAuthorizedOfficialError,
  validateOfficial,
  type LeaveAuthorizedOfficialAssignment,
  type LeaveAuthorizedOfficialInput,
} from "./service";

// Identity and effective period only. Audit references do not rewrite archival metadata.
export const correctionFields = [
  "fullName",
  "nip",
  "capacity",
  "effectiveFrom",
  "effectiveTo",
] as const;
export type OfficialIdentity = Pick<
  LeaveAuthorizedOfficialInput,
  (typeof correctionFields)[number]
>;
export const correctionSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
    changes: z
      .object({
        fullName: z.string().trim().min(1).max(200).optional(),
        nip: z.string().trim().min(1).max(32).optional(),
        capacity: z.enum(["DEFINITIVE", "PLT", "PLH"]).optional(),
        effectiveFrom: z.string().optional(),
        effectiveTo: z.string().nullable().optional(),
      })
      .strict(),
    reason: z.string().trim().min(1).max(1000),
    sourceReference: z.string().trim().min(1).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export type OfficialCorrectionInput = z.infer<typeof correctionSchema>;
export type OfficialCorrection = {
  id: string;
  assignmentId: string;
  actorUserId: string;
  correctedAt: string;
  reason: string;
  sourceReference: string;
  fields: string[];
  before: OfficialIdentity;
  after: OfficialIdentity;
  revision: number;
};
export function officialIdentity(value: OfficialIdentity): OfficialIdentity {
  return {
    fullName: value.fullName,
    nip: value.nip,
    capacity: value.capacity,
    effectiveFrom: value.effectiveFrom,
    effectiveTo: value.effectiveTo,
  };
}
export function prepareOfficialCorrection(
  current: LeaveAuthorizedOfficialAssignment,
  input: OfficialCorrectionInput,
  now: Date,
) {
  if (current.effectiveFrom > toBusinessDate(now))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Penugasan akan datang menggunakan edit biasa.",
    );
  const before = officialIdentity(current);
  const after = { ...before, ...input.changes };
  validateOfficial({ ...current, ...after });
  const fields = correctionFields.filter(
    (field) => before[field] !== after[field],
  );
  if (!fields.length)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tidak ada perubahan nilai untuk dikoreksi.",
    );
  return { before, after, fields };
}
export interface OfficialCorrectionRepository {
  history(id: string): Promise<{
    assignment: LeaveAuthorizedOfficialAssignment;
    corrections: OfficialCorrection[];
  }>;
  correct(
    id: string,
    actor: string,
    input: OfficialCorrectionInput,
    now: Date,
  ): Promise<OfficialCorrection>;
}
export class OfficialCorrectionService {
  constructor(
    private readonly repository: OfficialCorrectionRepository,
    private readonly clock = () => new Date(),
  ) {}
  history(principal: Principal, id: string) {
    requireAdmin(principal);
    return this.repository.history(id);
  }
  correct(principal: Principal, id: string, value: unknown) {
    requireAdmin(principal);
    const parsed = correctionSchema.safeParse(value);
    if (!parsed.success)
      throw new LeaveAuthorizedOfficialError(
        "VALIDATION",
        "Koreksi tidak valid. Isi perubahan, alasan, referensi dan konfirmasi; field lain tidak diizinkan.",
      );
    return this.repository.correct(
      id,
      principal.userId,
      parsed.data,
      this.clock(),
    );
  }
}
