import { describe, expect, it } from "vitest";
import {
  LeaveAuthorizedOfficialError,
  LeaveAuthorizedOfficialService,
  authorizedOfficialStatus,
  type LeaveAuthorizedOfficialAssignment,
  type LeaveAuthorizedOfficialRepository,
  type LeaveAuthorizedOfficialWrite,
} from "@/application/leave-authorized-official/service";

class MemoryRepository implements LeaveAuthorizedOfficialRepository {
  items: LeaveAuthorizedOfficialAssignment[] = [];
  list = async () => this.items;
  findById = async (id: string) =>
    this.items.find((item) => item.id === id) ?? null;
  findOverlapping = async (
    from: string,
    to: string | null,
    excludeId?: string,
  ) =>
    this.items.filter(
      (item) =>
        item.id !== excludeId &&
        item.effectiveFrom <= (to ?? "9999-12-31") &&
        (item.effectiveTo === null || item.effectiveTo >= from),
    );
  create = async (input: LeaveAuthorizedOfficialWrite) => this.save(input);
  update = async (id: string, input: LeaveAuthorizedOfficialWrite) =>
    this.save(input, id);
  findEffectiveOn = async (date: string) =>
    this.items.filter(
      (item) =>
        item.effectiveFrom <= date &&
        (item.effectiveTo === null || item.effectiveTo >= date),
    );
  private save(
    input: LeaveAuthorizedOfficialWrite,
    id = `official-${this.items.length + 1}`,
  ) {
    const item = {
      ...input,
      id,
      effectiveTo: input.effectiveTo ?? null,
      sourceReference: input.sourceReference ?? null,
      notes: input.notes ?? null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as LeaveAuthorizedOfficialAssignment;
    this.items = [...this.items.filter((current) => current.id !== id), item];
    return item;
  }
}
const input = (
  capacity: "DEFINITIVE" | "PLT" | "PLH" = "DEFINITIVE",
  from = "2026-01-01",
  to: string | null = "2026-06-30",
) => ({
  fullName: "  Pejabat Fiktif  ",
  nip: " 000000000000000001 ",
  capacity,
  effectiveFrom: from,
  effectiveTo: to,
  sourceReference: " Referensi Uji ",
  notes: " Catatan Uji ",
});

describe("LeaveAuthorizedOfficialService", () => {
  it.each(["DEFINITIVE", "PLT", "PLH"] as const)(
    "creates and trims a valid %s assignment",
    async (capacity) => {
      const service = new LeaveAuthorizedOfficialService(
        new MemoryRepository(),
      );
      const result = await service.create(input(capacity));
      expect(result).toMatchObject({
        capacity,
        fullName: "Pejabat Fiktif",
        nip: "000000000000000001",
        sourceReference: "Referensi Uji",
      });
    },
  );
  it("rejects an end date before its start", async () => {
    const service = new LeaveAuthorizedOfficialService(new MemoryRepository());
    await expect(
      service.create(input("DEFINITIVE", "2026-02-01", "2026-01-31")),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
  });
  it("rejects inclusive overlap but accepts adjacent periods", async () => {
    const service = new LeaveAuthorizedOfficialService(new MemoryRepository());
    await service.create(input());
    await expect(
      service.create(input("PLT", "2026-06-30", null)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.create(input("PLT", "2026-07-01", null)),
    ).resolves.toMatchObject({ capacity: "PLT" });
  });
  it("rejects overlap on update", async () => {
    const repository = new MemoryRepository();
    const service = new LeaveAuthorizedOfficialService(repository);
    const first = await service.create(input());
    await service.create(input("PLT", "2026-07-01", null));
    await expect(
      service.update(first.id, input("DEFINITIVE", "2026-01-01", "2026-07-01")),
    ).rejects.toBeInstanceOf(LeaveAuthorizedOfficialError);
  });
  it("resolves inclusive boundaries, successor, and no assignment", async () => {
    const service = new LeaveAuthorizedOfficialService(new MemoryRepository());
    const first = await service.create(input());
    const second = await service.create(input("PLT", "2026-07-01", null));
    await expect(service.resolve("2026-01-01")).resolves.toEqual(first);
    await expect(service.resolve("2026-06-30")).resolves.toEqual(first);
    await expect(service.resolve("2026-07-01")).resolves.toEqual(second);
    await expect(service.resolve("2025-12-31")).resolves.toBeNull();
  });
  it("does not silently choose from corrupt overlapping records", async () => {
    const repository = new MemoryRepository();
    repository.items = [
      await repository.create(input()),
      await repository.create(input("PLT")),
    ];
    await expect(
      new LeaveAuthorizedOfficialService(repository).resolve("2026-02-01"),
    ).rejects.toMatchObject({ code: "INVARIANT" });
  });
  it("derives all display statuses from dates", () => {
    const today = new Date("2026-06-15T12:00:00Z");
    expect(
      authorizedOfficialStatus(
        { effectiveFrom: "2026-01-01", effectiveTo: null },
        today,
      ),
    ).toBe("AKTIF");
    expect(
      authorizedOfficialStatus(
        { effectiveFrom: "2026-07-01", effectiveTo: null },
        today,
      ),
    ).toBe("AKAN_DATANG");
    expect(
      authorizedOfficialStatus(
        { effectiveFrom: "2026-01-01", effectiveTo: "2026-06-14" },
        today,
      ),
    ).toBe("BERAKHIR");
  });
});
