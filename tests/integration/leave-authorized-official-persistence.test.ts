import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "@/infrastructure/database/client";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("database master pejabat cuti", () => {
  const database = createDatabaseClient();
  const ids: string[] = [];

  afterEach(async () => {
    await database.leaveAuthorizedOfficialAssignment.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
  });
  afterAll(() => database.$disconnect());

  it("memiliki CHECK urutan tanggal dan exclusion constraint periode", async () => {
    const constraints = await database.$queryRaw<Array<{ name: string; definition: string }>>`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = '"LeaveAuthorizedOfficialAssignment"'::regclass
        AND conname IN (
          'LeaveAuthorizedOfficialAssignment_effective_period_check',
          'LeaveAuthorizedOfficialAssignment_no_period_overlap'
        )
      ORDER BY conname
    `;
    expect(constraints).toHaveLength(2);
    expect(constraints.find((item) => item.name.endsWith("no_period_overlap"))?.definition).toContain("EXCLUDE USING gist");
  });

  it("database sendiri menolak overlap dengan batas tanggal inklusif", async () => {
    const first = await database.leaveAuthorizedOfficialAssignment.create({
      data: { fullName: "Pejabat Uji A", nip: "UJI-PEJABAT-A", capacity: "DEFINITIVE", effectiveFrom: new Date("2198-01-01T00:00:00Z"), effectiveTo: new Date("2198-06-30T00:00:00Z") },
    });
    ids.push(first.id);
    await expect(database.leaveAuthorizedOfficialAssignment.create({
      data: { fullName: "Pejabat Uji B", nip: "UJI-PEJABAT-B", capacity: "PLT", effectiveFrom: new Date("2198-06-30T00:00:00Z") },
    })).rejects.toThrow();
    const successor = await database.leaveAuthorizedOfficialAssignment.create({
      data: { fullName: "Pejabat Uji B", nip: "UJI-PEJABAT-B", capacity: "PLT", effectiveFrom: new Date("2198-07-01T00:00:00Z") },
    });
    ids.push(successor.id);
  });
});
