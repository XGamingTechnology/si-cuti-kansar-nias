import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  OfficialCorrectionService,
  correctionSchema,
  prepareOfficialCorrection,
} from "@/application/leave-authorized-official/correction";
const admin = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN" as const,
};
const current = {
  id: randomUUID(),
  revision: 0,
  fullName: "Pejabat Uji",
  nip: "TEST",
  capacity: "DEFINITIVE" as const,
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
  sourceReference: null,
  notes: null,
};
const input = () => ({
  expectedRevision: 0,
  idempotencyKey: randomUUID(),
  changes: { fullName: "Pejabat Koreksi" },
  reason: " Salah eja ",
  sourceReference: " SK-UJI ",
  confirmed: true as const,
});
describe("official emergency correction boundary", () => {
  it.each([
    "actorUserId",
    "correctedAt",
    "before",
    "after",
    "role",
    "assignmentId",
  ])("rejects authority field %s", (field) =>
    expect(
      correctionSchema.safeParse({ ...input(), [field]: "forged" }).success,
    ).toBe(false),
  );
  it.each(["notes", "sourceReference", "revision", "id"])(
    "rejects change outside allowlist %s",
    (field) =>
      expect(
        correctionSchema.safeParse({
          ...input(),
          changes: { [field]: "forged" },
        }).success,
      ).toBe(false),
  );
  it.each([
    { reason: "  " },
    { sourceReference: " " },
    { confirmed: false },
    { reason: "x".repeat(1001) },
    { sourceReference: "x".repeat(501) },
  ])("requires bounded audit and confirmation %j", (override) =>
    expect(
      correctionSchema.safeParse({ ...input(), ...override }).success,
    ).toBe(false),
  );
  it("normalizes values and computes actual server before/after fields", () => {
    const value = correctionSchema.parse(input());
    expect(value.reason).toBe("Salah eja");
    expect(
      prepareOfficialCorrection(current, value, new Date("2026-01-01Z")),
    ).toMatchObject({
      fields: ["fullName"],
      before: { fullName: "Pejabat Uji" },
      after: { fullName: "Pejabat Koreksi" },
    });
  });
  it("rejects no-op, impossible dates, reversed period and FUTURE", () => {
    for (const changes of [
      {},
      { fullName: current.fullName },
      { effectiveFrom: "2020-02-30" },
      { effectiveTo: "2019-12-31" },
    ])
      expect(() =>
        prepareOfficialCorrection(
          current,
          { ...input(), changes },
          new Date("2026-01-01Z"),
        ),
      ).toThrow();
    expect(() =>
      prepareOfficialCorrection(
        { ...current, effectiveFrom: "2099-01-01" },
        input(),
        new Date("2026-01-01Z"),
      ),
    ).toThrow("edit biasa");
  });
  it("denies Pegawai at application boundary for writes and history", () => {
    const repository = { correct: vi.fn(), history: vi.fn() };
    const service = new OfficialCorrectionService(repository);
    const employee = { ...admin, role: "PEGAWAI" as const };
    expect(() => service.correct(employee, current.id, input())).toThrow(
      "Forbidden",
    );
    expect(() => service.history(employee, current.id)).toThrow("Forbidden");
    expect(repository.correct).not.toHaveBeenCalled();
    expect(repository.history).not.toHaveBeenCalled();
  });
  it("takes actor and clock from service, not input", () => {
    const repository = { correct: vi.fn(), history: vi.fn() };
    const now = new Date("2026-01-01Z");
    new OfficialCorrectionService(repository, () => now).correct(
      admin,
      current.id,
      input(),
    );
    expect(repository.correct.mock.calls[0][1]).toBe(admin.userId);
    expect(repository.correct.mock.calls[0][3]).toEqual(now);
  });
});
