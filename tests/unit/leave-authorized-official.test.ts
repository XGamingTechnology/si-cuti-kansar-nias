import { describe, expect, it } from "vitest";
import {
  LeaveAuthorizedOfficialError,
  LeaveAuthorizedOfficialService,
  authorizedOfficialStatus,
  authorizedOfficialTitle,
  type LeaveAuthorizedOfficialAssignment,
  type LeaveAuthorizedOfficialInput,
  type LeaveAuthorizedOfficialRepository,
} from "@/application/leave-authorized-official/service";
import { toBusinessDate } from "@/domain/business-date";

class MemoryRepository implements LeaveAuthorizedOfficialRepository {
  items: LeaveAuthorizedOfficialAssignment[] = [];
  list = async () => this.items;
  findById = async (id: string) => this.items.find((item) => item.id === id) ?? null;
  findEffectiveOn = async (date: string) =>
    this.items.find((item) => item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date)) ?? null;
  hasOverlap = async (from: string, to: string | null, exceptId?: string) =>
    this.items.some((item) => item.id !== exceptId && item.effectiveFrom <= (to ?? "9999-12-31") && (item.effectiveTo ?? "9999-12-31") >= from);
  create = async (input: LeaveAuthorizedOfficialInput) => {
    const item = { id: String(this.items.length + 1), ...input };
    this.items.push(item);
    return item;
  };
  update = async (id: string, input: LeaveAuthorizedOfficialInput) => {
    const item = { id, ...input };
    this.items = this.items.map((current) => current.id === id ? item : current);
    return item;
  };
}

const input = (overrides: Partial<LeaveAuthorizedOfficialInput> = {}): LeaveAuthorizedOfficialInput => ({
  fullName: "Pejabat Uji",
  nip: "190000000000000001",
  capacity: "DEFINITIVE",
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
  sourceReference: null,
  notes: null,
  ...overrides,
});
const clock = () => new Date("2026-09-13T05:00:00.000Z");

describe("master pejabat cuti", () => {
  it("mengubah seluruh field penugasan masa depan", async () => {
    const repository = new MemoryRepository();
    const service = new LeaveAuthorizedOfficialService(repository, clock);
    const created = await service.create(input());
    const changed = await service.update(created.id, input({ fullName: "Pejabat Masa Depan", capacity: "PLT", effectiveFrom: "2026-11-01", sourceReference: "Surat uji" }));
    expect(changed).toMatchObject({ fullName: "Pejabat Masa Depan", capacity: "PLT", effectiveFrom: "2026-11-01" });
  });

  it("menolak perubahan identitas pejabat aktif tetapi boleh mengakhirinya hari ini atau nanti", async () => {
    const repository = new MemoryRepository();
    repository.items.push({ id: "active", ...input({ effectiveFrom: "2026-01-01" }) });
    const service = new LeaveAuthorizedOfficialService(repository, clock);
    await expect(service.update("active", input({ fullName: "Nama Baru", effectiveFrom: "2026-01-01" }))).rejects.toThrow("Identitas dan tanggal mulai");
    await expect(service.update("active", input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-09-13" }))).resolves.toMatchObject({ effectiveTo: "2026-09-13" });
  });

  it("menolak tanggal akhir lampau untuk pejabat aktif", async () => {
    const repository = new MemoryRepository();
    repository.items.push({ id: "active", ...input({ effectiveFrom: "2026-01-01" }) });
    await expect(new LeaveAuthorizedOfficialService(repository, clock).update("active", input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-09-12" }))).rejects.toThrow("hari ini");
  });

  it("mengunci identitas dan tanggal penugasan berakhir sambil mempertahankan catatan administratif", async () => {
    const repository = new MemoryRepository();
    repository.items.push({ id: "ended", ...input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-08-31" }) });
    const service = new LeaveAuthorizedOfficialService(repository, clock);
    await expect(service.update("ended", input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-09-01" }))).rejects.toThrow("Tanggal penugasan");
    await expect(service.update("ended", input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-08-31", notes: "Nomor arsip dilengkapi" }))).resolves.toMatchObject({ notes: "Nomor arsip dilengkapi" });
  });

  it("membuat penerus sebagai penugasan terpisah dan menjaga batas inklusif", async () => {
    const repository = new MemoryRepository();
    const service = new LeaveAuthorizedOfficialService(repository, clock);
    await service.create(input({ effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }));
    await expect(service.create(input({ fullName: "Penerus", effectiveFrom: "2026-07-01" }))).resolves.toMatchObject({ id: "2" });
    await expect(service.create(input({ effectiveFrom: "2026-06-30" }))).rejects.toBeInstanceOf(LeaveAuthorizedOfficialError);
  });

  it("tetap menyelesaikan pejabat historis yang sama setelah penerus dibuat", async () => {
    const repository = new MemoryRepository();
    const service = new LeaveAuthorizedOfficialService(repository, clock);
    const historical = await service.create(input({
      fullName: "Pejabat Lama",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-09-13",
    }));

    await service.create(input({
      fullName: "Pejabat Penerus",
      nip: "190000000000000002",
      effectiveFrom: "2026-09-14",
    }));

    await expect(
      service.resolveAt(new Date("2026-09-13T10:00:00.000Z")),
    ).resolves.toEqual(historical);
    await expect(
      service.resolveAt(new Date("2026-09-13T17:00:00.000Z")),
    ).resolves.toMatchObject({ fullName: "Pejabat Penerus" });
  });

  it("menggunakan tanggal bisnis Asia/Jakarta dan status turunannya", async () => {
    expect(toBusinessDate(new Date("2026-09-30T17:30:00.000Z"))).toBe("2026-10-01");
    expect(toBusinessDate(new Date("2026-09-30T16:30:00.000Z"))).toBe("2026-09-30");
    const repository = new MemoryRepository();
    repository.items.push({ id: "new", ...input({ fullName: "Pejabat Oktober" }) });
    await expect(new LeaveAuthorizedOfficialService(repository).resolveAt(new Date("2026-09-30T17:30:00.000Z"))).resolves.toMatchObject({ fullName: "Pejabat Oktober" });
    expect(authorizedOfficialStatus(repository.items[0], new Date("2026-09-30T17:30:00.000Z"))).toBe("Aktif");
  });

  it("mempertahankan judul kapasitas", () => {
    expect(authorizedOfficialTitle("DEFINITIVE")).toMatch(/^Kepala Kantor/);
    expect(authorizedOfficialTitle("PLT")).toMatch(/^Plt\. Kepala Kantor/);
    expect(authorizedOfficialTitle("PLH")).toMatch(/^Plh\. Kepala Kantor/);
  });
});
