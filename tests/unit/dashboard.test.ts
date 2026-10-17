import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DashboardService,
  parseDashboardFilter,
  readCursor,
  filterIdentity,
} from "@/application/dashboard/contracts";
import {
  normalizeOverlay,
  OverlayService,
} from "@/application/dashboard/overlay";
const admin = {
  userId: randomUUID(),
  employeeId: randomUUID(),
  fullName: "Admin Uji",
  role: "ADMIN_KEPEGAWAIAN" as const,
};
const owner = { ...admin, role: "PEGAWAI" as const };
const clock = () => new Date("2026-12-31T17:00:00Z");
const filter = (extra = "") =>
  new URLSearchParams(`kind=leave&from=2026-12-30&to=2027-01-03${extra}`);
const dataset = () => ({
  year: 2027,
  sourceReference: "Dokumen sintetis pengujian",
  sourcePublishedOn: "2026-12-20",
  sourceUrl: "",
  events: [
    {
      date: "2027-01-02",
      name: "Tanggal sintetis, bukan libur pemerintah",
      category: "PUBLIC_HOLIDAY",
    },
  ],
});
describe("M6 read contracts", () => {
  it("uses WIB month default at UTC year boundary and permits inclusive cross-year overlap filter", () => {
    expect(
      parseDashboardFilter(
        owner,
        new URLSearchParams("kind=leave"),
        clock(),
        366,
      ),
    ).toMatchObject({
      from: "2027-01-01",
      to: "2027-01-31",
      status: "APPROVED",
    });
    expect(parseDashboardFilter(admin, filter(), clock(), 62).to).toBe(
      "2027-01-03",
    );
  });
  it.each([
    "&status=DRAFT",
    "&status=FAKE",
    "&from=2026-02-30",
    "&from=2027-01-04",
    "&to=2028-01-01",
    "&limit=0",
    "&limit=51",
    "&type=unknown",
    "&employeeId=invalid",
    "&reason=private",
    "&kind=other",
    "&kind=leave",
  ])("rejects invalid filter %s", (extra) =>
    expect(() =>
      parseDashboardFilter(admin, filter(extra), clock(), 366),
    ).toThrow(),
  );
  it("accepts leap date and rejects range above calendar cap but permits 62 inclusive days", () => {
    expect(
      parseDashboardFilter(
        admin,
        new URLSearchParams("kind=leave&from=2024-02-29&to=2024-02-29"),
        clock(),
        62,
      ).from,
    ).toBe("2024-02-29");
    expect(() =>
      parseDashboardFilter(
        admin,
        new URLSearchParams("kind=leave&from=2026-01-01&to=2026-03-04"),
        clock(),
        62,
      ),
    ).toThrow();
    expect(
      parseDashboardFilter(
        admin,
        new URLSearchParams("kind=leave&from=2026-01-01&to=2026-03-03"),
        clock(),
        62,
      ).to,
    ).toBe("2026-03-03");
  });
  it("denies even self employee filter and refuses kind/type mismatch", () => {
    expect(() =>
      parseDashboardFilter(
        owner,
        filter(`&employeeId=${owner.employeeId}`),
        clock(),
        366,
      ),
    ).toThrow("tidak diizinkan");
    expect(() =>
      parseDashboardFilter(
        admin,
        new URLSearchParams("kind=permission&type=ANNUAL"),
        clock(),
        366,
      ),
    ).toThrow("Jenis");
  });
  it("binds and validates cursor to owner/kind/filter but never treats it as authorization", () => {
    const f = parseDashboardFilter(owner, filter(), clock(), 366);
    const cursor = Buffer.from(
      JSON.stringify({
        date: "2026-12-31",
        id: randomUUID(),
        filter: filterIdentity(f, owner),
      }),
    ).toString("base64url");
    expect(readCursor({ ...f, cursor }, owner)?.date).toBe("2026-12-31");
    expect(() =>
      readCursor({ ...f, cursor }, { ...owner, employeeId: randomUUID() }),
    ).toThrow();
    expect(() => readCursor({ ...f, cursor: "not-json" }, owner)).toThrow();
  });
  it("requires explicit roles and isolates employee-only balance and Admin-only lookup", () => {
    const reader = { balance: vi.fn(), employees: vi.fn() };
    const service = new DashboardService(reader as never, clock);
    expect(() => service.balance(admin)).toThrow("Forbidden");
    return expect(
      service.employees(owner, new URLSearchParams()),
    ).rejects.toThrow("Forbidden");
  });
});
describe("official document overlay contracts", () => {
  it.each([
    {},
    { ...dataset(), actorUserId: "forged" },
    { ...dataset(), events: [] },
    {
      ...dataset(),
      events: [
        { date: "2027-02-30", name: "Invalid", category: "PUBLIC_HOLIDAY" },
      ],
    },
    {
      ...dataset(),
      events: [
        { date: "2026-01-01", name: "Wrong year", category: "JOINT_LEAVE" },
      ],
    },
    { ...dataset(), events: [...dataset().events, ...dataset().events] },
    { ...dataset(), sourceUrl: "https://community.example/calendar" },
    { ...dataset(), sourceReference: "  " },
    { ...dataset(), sourceUrl: "https://user:secret@jdih.menpan.go.id/doc" },
  ])("rejects invalid/authority/unverified URL payload %j", (value) =>
    expect(() => normalizeOverlay(value)).toThrow(),
  );
  it("sorts normalized events without inferring eligibility or mutating calendar exceptions", () => {
    const value = normalizeOverlay({
      ...dataset(),
      sourceReference: " Ref ",
      events: [
        { date: "2027-01-03", name: " Test ", category: "JOINT_LEAVE" },
        ...dataset().events,
      ],
    });
    expect(value.sourceReference).toBe("Ref");
    expect(value.events.map((v) => v.date)).toEqual([
      "2027-01-02",
      "2027-01-03",
    ]);
  });
  it("shows unavailable without fabricating data or connector status", async () => {
    const repo = {
      latest: vi.fn(async () => null),
      history: vi.fn(),
      publish: vi.fn(),
    };
    const service = new OverlayService(repo);
    expect(await service.read(owner, 2027)).toMatchObject({
      status: "UNAVAILABLE",
      dataset: null,
      automaticallySynced: false,
    });
  });
  it("Admin preview derives diff and fingerprint; tampering and Pegawai writes are rejected", async () => {
    const repo = {
      latest: vi.fn(async () => null),
      history: vi.fn(),
      publish: vi.fn(),
    };
    const service = new OverlayService(repo);
    await expect(service.preview(owner, dataset())).rejects.toThrow(
      "Forbidden",
    );
    const preview = await service.preview(admin, dataset());
    expect(preview.diff.added).toHaveLength(1);
    expect(() =>
      service.publish(admin, {
        expectedVersion: preview.expectedVersion,
        fingerprint: preview.fingerprint,
        data: { ...preview.data, sourceReference: "changed" },
        idempotencyKey: randomUUID(),
        confirmed: true,
      }),
    ).toThrow("Pratinjau berubah");
    expect(() => service.publish(owner, {})).toThrow("Forbidden");
    expect(() =>
      service.publish(admin, {
        data: preview.data,
        expectedVersion: 0,
        fingerprint: preview.fingerprint,
        idempotencyKey: randomUUID(),
        confirmed: false,
      }),
    ).toThrow();
    expect(repo.publish).not.toHaveBeenCalled();
  });
});
