export const AUTHORIZED_OFFICIAL_BASE_TITLE =
  "Kepala Kantor Pencarian dan Pertolongan Kelas B Nias";

export type LeaveAuthorizedOfficialCapacity = "DEFINITIVE" | "PLT" | "PLH";
export type LeaveAuthorizedOfficialStatus =
  | "AKTIF"
  | "AKAN_DATANG"
  | "BERAKHIR";

export type LeaveAuthorizedOfficialAssignment = Readonly<{
  id: string;
  fullName: string;
  nip: string;
  capacity: LeaveAuthorizedOfficialCapacity;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type LeaveAuthorizedOfficialWrite = Readonly<{
  fullName: string;
  nip: string;
  capacity: LeaveAuthorizedOfficialCapacity;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceReference?: string | null;
  notes?: string | null;
}>;

export interface LeaveAuthorizedOfficialRepository {
  list(): Promise<readonly LeaveAuthorizedOfficialAssignment[]>;
  findById(id: string): Promise<LeaveAuthorizedOfficialAssignment | null>;
  findOverlapping(
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string,
  ): Promise<readonly LeaveAuthorizedOfficialAssignment[]>;
  create(
    input: LeaveAuthorizedOfficialWrite,
  ): Promise<LeaveAuthorizedOfficialAssignment>;
  update(
    id: string,
    input: LeaveAuthorizedOfficialWrite,
  ): Promise<LeaveAuthorizedOfficialAssignment>;
  findEffectiveOn(
    date: string,
  ): Promise<readonly LeaveAuthorizedOfficialAssignment[]>;
}

export type LeaveAuthorizedOfficialErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVARIANT";

export class LeaveAuthorizedOfficialError extends Error {
  constructor(
    public readonly code: LeaveAuthorizedOfficialErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LeaveAuthorizedOfficialError";
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
function required(value: string | undefined, message: string, max: number) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new LeaveAuthorizedOfficialError("VALIDATION", message);
  if (trimmed.length > max)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      `Nilai tidak boleh melebihi ${max} karakter.`,
    );
  return trimmed;
}
function optional(value: string | null | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      `Nilai tidak boleh melebihi ${max} karakter.`,
    );
  return trimmed || null;
}

function normalize(
  input: LeaveAuthorizedOfficialWrite,
): LeaveAuthorizedOfficialWrite {
  const fullName = required(input.fullName, "Nama pejabat wajib diisi.", 200);
  const nip = required(input.nip, "NIP wajib diisi.", 32);
  if (!(["DEFINITIVE", "PLT", "PLH"] as const).includes(input.capacity))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Kapasitas pejabat wajib dipilih.",
    );
  const effectiveFrom = input.effectiveFrom?.trim();
  if (!effectiveFrom)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal mulai berlaku wajib diisi.",
    );
  if (!validDate(effectiveFrom))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal mulai berlaku tidak valid.",
    );
  const effectiveTo = input.effectiveTo?.trim() || null;
  if (effectiveTo && !validDate(effectiveTo))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal selesai berlaku tidak valid.",
    );
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    );
  return {
    fullName,
    nip,
    capacity: input.capacity,
    effectiveFrom,
    effectiveTo,
    sourceReference: optional(input.sourceReference, 500),
    notes: optional(input.notes, 10000),
  };
}

export function authorizedOfficialTitle(
  capacity: LeaveAuthorizedOfficialCapacity,
) {
  if (capacity === "PLT") return `Plt. ${AUTHORIZED_OFFICIAL_BASE_TITLE}`;
  if (capacity === "PLH") return `Plh. ${AUTHORIZED_OFFICIAL_BASE_TITLE}`;
  return AUTHORIZED_OFFICIAL_BASE_TITLE;
}

export function authorizedOfficialStatus(
  assignment: Pick<
    LeaveAuthorizedOfficialAssignment,
    "effectiveFrom" | "effectiveTo"
  >,
  today = new Date(),
): LeaveAuthorizedOfficialStatus {
  const date = today.toISOString().slice(0, 10);
  if (date < assignment.effectiveFrom) return "AKAN_DATANG";
  if (assignment.effectiveTo && date > assignment.effectiveTo)
    return "BERAKHIR";
  return "AKTIF";
}

export class LeaveAuthorizedOfficialService {
  constructor(private readonly repository: LeaveAuthorizedOfficialRepository) {}
  list() {
    return this.repository.list();
  }
  async get(id: string) {
    const item = await this.repository.findById(id.trim());
    if (!item)
      throw new LeaveAuthorizedOfficialError(
        "NOT_FOUND",
        "Data pejabat tidak ditemukan.",
      );
    return item;
  }
  async create(input: LeaveAuthorizedOfficialWrite) {
    const value = normalize(input);
    await this.ensureNoOverlap(value.effectiveFrom, value.effectiveTo ?? null);
    return this.repository.create(value);
  }
  async update(id: string, input: LeaveAuthorizedOfficialWrite) {
    await this.get(id);
    const value = normalize(input);
    await this.ensureNoOverlap(
      value.effectiveFrom,
      value.effectiveTo ?? null,
      id,
    );
    return this.repository.update(id, value);
  }
  async resolve(target: string | Date) {
    const date =
      target instanceof Date
        ? target.toISOString().slice(0, 10)
        : target.trim();
    if (!validDate(date))
      throw new LeaveAuthorizedOfficialError(
        "VALIDATION",
        "Tanggal acuan tidak valid.",
      );
    const matches = await this.repository.findEffectiveOn(date);
    if (matches.length > 1)
      throw new LeaveAuthorizedOfficialError(
        "INVARIANT",
        "Data pejabat berwenang tumpang tindih. Hubungi Admin Kepegawaian.",
      );
    return matches[0] ?? null;
  }
  private async ensureNoOverlap(
    from: string,
    to: string | null,
    excludeId?: string,
  ) {
    if ((await this.repository.findOverlapping(from, to, excludeId)).length)
      throw new LeaveAuthorizedOfficialError(
        "CONFLICT",
        "Periode pejabat tidak boleh tumpang tindih dengan pejabat lain.",
      );
  }
}
