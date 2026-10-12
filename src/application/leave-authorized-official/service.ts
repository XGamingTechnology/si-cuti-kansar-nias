import { toBusinessDate } from "@/domain/business-date";

export type LeaveAuthorizedOfficialCapacity = "DEFINITIVE" | "PLT" | "PLH";

export type LeaveAuthorizedOfficialAssignment = Readonly<{
  id: string;
  fullName: string;
  nip: string;
  capacity: LeaveAuthorizedOfficialCapacity;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string | null;
  notes: string | null;
}>;

export type LeaveAuthorizedOfficialInput = Omit<
  LeaveAuthorizedOfficialAssignment,
  "id"
>;

export interface LeaveAuthorizedOfficialRepository {
  list(): Promise<readonly LeaveAuthorizedOfficialAssignment[]>;
  findById(id: string): Promise<LeaveAuthorizedOfficialAssignment | null>;
  findEffectiveOn(date: string): Promise<LeaveAuthorizedOfficialAssignment | null>;
  hasOverlap(
    from: string,
    to: string | null,
    exceptId?: string,
  ): Promise<boolean>;
  create(
    input: LeaveAuthorizedOfficialInput,
  ): Promise<LeaveAuthorizedOfficialAssignment>;
  update(
    id: string,
    input: LeaveAuthorizedOfficialInput,
  ): Promise<LeaveAuthorizedOfficialAssignment>;
}

export class LeaveAuthorizedOfficialError extends Error {
  constructor(
    readonly code: "VALIDATION" | "NOT_FOUND" | "OVERLAP",
    message: string,
  ) {
    super(message);
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const capacities = new Set<LeaveAuthorizedOfficialCapacity>([
  "DEFINITIVE",
  "PLT",
  "PLH",
]);

function validate(input: LeaveAuthorizedOfficialInput) {
  if (!input.fullName.trim() || input.fullName.length > 200)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Nama lengkap pejabat wajib diisi dan maksimal 200 karakter.",
    );
  if (!input.nip.trim() || input.nip.length > 32)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "NIP pejabat wajib diisi dan maksimal 32 karakter.",
    );
  if (!capacities.has(input.capacity))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Kapasitas pejabat tidak valid.",
    );
  if (!datePattern.test(input.effectiveFrom))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal mulai berlaku tidak valid.",
    );
  if (input.effectiveTo && !datePattern.test(input.effectiveTo))
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal akhir berlaku tidak valid.",
    );
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
    throw new LeaveAuthorizedOfficialError(
      "VALIDATION",
      "Tanggal akhir berlaku tidak boleh lebih awal dari tanggal mulai.",
    );
}

function normalized(input: LeaveAuthorizedOfficialInput) {
  return {
    ...input,
    fullName: input.fullName.trim(),
    nip: input.nip.trim(),
    sourceReference: input.sourceReference?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export function authorizedOfficialTitle(
  capacity: LeaveAuthorizedOfficialCapacity,
) {
  const prefix = capacity === "PLT" ? "Plt. " : capacity === "PLH" ? "Plh. " : "";
  return `${prefix}Kepala Kantor Pencarian dan Pertolongan Kelas B Nias`;
}

export function authorizedOfficialStatus(
  assignment: Pick<
    LeaveAuthorizedOfficialAssignment,
    "effectiveFrom" | "effectiveTo"
  >,
  now = new Date(),
): "Aktif" | "Akan Datang" | "Berakhir" {
  const today = toBusinessDate(now);
  if (assignment.effectiveFrom > today) return "Akan Datang";
  if (assignment.effectiveTo && assignment.effectiveTo < today)
    return "Berakhir";
  return "Aktif";
}

export class LeaveAuthorizedOfficialService {
  constructor(
    private readonly repository: LeaveAuthorizedOfficialRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list() {
    return this.repository.list();
  }

  resolveAt(timestamp: Date) {
    return this.repository.findEffectiveOn(toBusinessDate(timestamp));
  }

  async create(input: LeaveAuthorizedOfficialInput) {
    validate(input);
    const value = normalized(input);
    await this.assertNoOverlap(value.effectiveFrom, value.effectiveTo);
    return this.repository.create(value);
  }

  async update(id: string, input: LeaveAuthorizedOfficialInput) {
    validate(input);
    const current = await this.repository.findById(id);
    if (!current)
      throw new LeaveAuthorizedOfficialError(
        "NOT_FOUND",
        "Penugasan pejabat cuti tidak ditemukan.",
      );
    const value = normalized(input);
    const today = toBusinessDate(this.clock());
    const isFuture = current.effectiveFrom > today;
    const isEnded = current.effectiveTo !== null && current.effectiveTo < today;

    if (!isFuture) {
      // sourceReference and notes are archival metadata only and are not rendered
      // as official identity in historical PDFs, so administrators may complete
      // them without changing who held the assignment or its effective period.
      const immutableIdentityChanged =
        value.fullName !== current.fullName ||
        value.nip !== current.nip ||
        value.capacity !== current.capacity ||
        value.effectiveFrom !== current.effectiveFrom;
      if (immutableIdentityChanged)
        throw new LeaveAuthorizedOfficialError(
          "VALIDATION",
          isEnded
            ? "Identitas dan tanggal penugasan yang telah berakhir tidak dapat diubah."
            : "Identitas dan tanggal mulai pejabat aktif tidak dapat diubah. Buat penugasan baru untuk pejabat pengganti.",
        );
      if (isEnded && value.effectiveTo !== current.effectiveTo)
        throw new LeaveAuthorizedOfficialError(
          "VALIDATION",
          "Tanggal penugasan yang telah berakhir tidak dapat diubah.",
        );
      if (!isEnded && value.effectiveTo !== null && value.effectiveTo < today)
        throw new LeaveAuthorizedOfficialError(
          "VALIDATION",
          "Tanggal akhir pejabat aktif harus hari ini atau tanggal yang akan datang.",
        );
    }

    await this.assertNoOverlap(value.effectiveFrom, value.effectiveTo, id);
    return this.repository.update(id, value);
  }

  private async assertNoOverlap(from: string, to: string | null, id?: string) {
    if (await this.repository.hasOverlap(from, to, id))
      throw new LeaveAuthorizedOfficialError(
        "OVERLAP",
        "Periode penugasan bertumpang tindih dengan pejabat cuti lain.",
      );
  }
}
